"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { getSocket } from "@/lib/socket";
import { toast } from "sonner";
import SimplePeer from "simple-peer";

interface FileTransferProps {
    roomId: string;
    isHost: boolean;
    hostId: string | null;
}

const CHUNK_SIZE = 16 * 1024; // 16KB chunks

export function FileTransfer({ roomId, isHost, hostId }: FileTransferProps) {
    const [peers, setPeers] = useState<{ [key: string]: SimplePeer.Instance }>({});
    const [file, setFile] = useState<File | null>(null);
    const [receivedFiles, setReceivedFiles] = useState<{ name: string; url: string }[]>([]);
    const [transferProgress, setTransferProgress] = useState(0);
    const [isTransferring, setIsTransferring] = useState(false);

    const socket = getSocket();
    const peersRef = useRef<{ [key: string]: SimplePeer.Instance }>({});
    const incomingFilesRef = useRef<{ [key: string]: { meta: any; chunks: Uint8Array[]; receivedSize: number } }>({});

    // Ref to track if we have already initiated a connection to a specific target to avoid duplicates in Strict Mode
    const initiatingRef = useRef<{ [key: string]: boolean }>({});

    useEffect(() => {
        if (!socket) return;

        const addPeer = (targetId: string, initiator: boolean) => {
            // Prevent duplicate peer creation for the same target
            if (peersRef.current[targetId]) {
                return peersRef.current[targetId];
            }

            // In strict mode, this might run twice. If we are initiator, we want to be careful.
            if (initiator && initiatingRef.current[targetId]) {
                const existing = peersRef.current[targetId];
                if (existing && !(existing as any).destroyed) {
                    return existing;
                }
                // If missing or destroyed, proceed to create new one
            }
            if (initiator) {
                initiatingRef.current[targetId] = true;
            }

            console.log(`Creating peer for ${targetId}, initiator: ${initiator}`);

            const peer = new SimplePeer({
                initiator,
                trickle: false,
            });

            peer.on("signal", (signal) => {
                console.log(`Sending signal to ${targetId}`);
                socket.emit("signal", { target: targetId, signal, roomId });
            });

            peer.on("data", (data: Uint8Array) => {
                try {
                    // Try to decode as string for metadata
                    const text = new TextDecoder().decode(data);
                    if (text.startsWith("meta:")) {
                        const meta = JSON.parse(text.substring(5));
                        incomingFilesRef.current[targetId] = {
                            meta,
                            chunks: [],
                            receivedSize: 0
                        };
                        toast.info(`Receiving ${meta.name} (${(meta.size / 1024).toFixed(1)} KB)...`);
                        return;
                    }
                } catch (e) {
                    // Ignore, likely binary data
                }

                const incoming = incomingFilesRef.current[targetId];
                if (incoming) {
                    incoming.chunks.push(data);
                    incoming.receivedSize += data.byteLength;

                    if (incoming.receivedSize >= incoming.meta.size) {
                        // Complete
                        const blob = new Blob(incoming.chunks as BlobPart[], { type: incoming.meta.type });
                        const url = URL.createObjectURL(blob);

                        // Use functional update to ensure we don't miss updates
                        setReceivedFiles(prev => {
                            // Avoid duplicates in UI if something weird happens
                            if (prev.some(f => f.name === incoming.meta.name)) return prev;
                            return [...prev, { name: incoming.meta.name, url }];
                        });

                        toast.success(`Received ${incoming.meta.name}`);
                        delete incomingFilesRef.current[targetId];
                    }
                }
            });

            peer.on("connect", () => {
                console.log(`Connected to peer ${targetId}`);
                toast.success(`Connected to peer ${targetId}`);
                setPeers((prev) => ({ ...prev, [targetId]: peer }));
            });

            peer.on("close", () => {
                console.log(`Peer closed ${targetId}`);
                // CRITICAL FIX: Only remove from ref if THIS peer is the one in the ref.
                // Otherwise, we might remove a NEW peer that replaced us (race condition).
                if (peersRef.current[targetId] === peer) {
                    delete peersRef.current[targetId];
                    delete incomingFilesRef.current[targetId];
                    delete initiatingRef.current[targetId];
                    setPeers((prev) => {
                        const newPeers = { ...prev };
                        delete newPeers[targetId];
                        return newPeers;
                    });
                }
            });

            peer.on("error", (err) => {
                console.error("Peer error:", err);
            });

            peersRef.current[targetId] = peer;
            return peer;
        };

        // Handle Host Logic: Wait for signals
        const onSignal = ({ sender, signal }: { sender: string, signal: any }) => {
            console.log(`[FileTransfer] Received signal from ${sender} (${signal.type})`);

            // If we receive a new offer from an existing peer, it means they restarted.
            // We must destroy the old peer and accept the new one.
            if (signal.type === 'offer' && peersRef.current[sender]) {
                console.log(`[FileTransfer] Received new offer from ${sender}, destroying old peer to restart.`);
                const oldPeer = peersRef.current[sender];
                oldPeer.destroy();
                delete peersRef.current[sender];
            }

            // CRITICAL FIX: Only create a new peer if the signal is an 'offer'.
            // If we receive an 'answer' or 'candidate' for a peer that doesn't exist,
            // it means the peer was closed or we are in a bad state. We must NOT create a new passive peer.
            if (!peersRef.current[sender] && signal.type !== 'offer') {
                console.warn(`[FileTransfer] Received orphan signal (${signal.type}) from ${sender}. Ignoring.`);
                return;
            }

            const peer = addPeer(sender, false);
            if (peer && !(peer as any).destroyed) {
                console.log(`[FileTransfer] Signaling peer ${sender} with ${signal.type}`);
                peer.signal(signal);
            } else {
                console.error(`[FileTransfer] Peer for ${sender} is destroyed or missing, cannot signal.`);
            }
        };

        socket.on("signal", onSignal);

        // Handle Guest Logic: Initiate if we have a hostId
        if (!isHost && hostId) {
            addPeer(hostId, true);
        }

        return () => {
            socket.off("signal", onSignal);
            Object.values(peersRef.current).forEach(p => {
                if (!p.destroyed) p.destroy();
            });
            peersRef.current = {};
            setPeers({});
            initiatingRef.current = {};
        };
    }, [socket, roomId, hostId, isHost]);

    const sendFile = async () => {
        if (!file) return;
        setIsTransferring(true);
        setTransferProgress(0);

        const peersList = Object.values(peersRef.current);
        if (peersList.length === 0) {
            toast.error("No peers connected");
            setIsTransferring(false);
            return;
        }

        const meta = JSON.stringify({ name: file.name, type: file.type, size: file.size });

        // Send Meta
        peersList.forEach(peer => {
            if (peer.connected) {
                peer.send("meta:" + meta);
            }
        });

        // Read and Send Chunks
        const buffer = await file.arrayBuffer();
        let offset = 0;

        const sendLoop = () => {
            if (offset >= buffer.byteLength) {
                setIsTransferring(false);
                setTransferProgress(100);
                toast.success("File sent successfully");
                return;
            }

            const chunk = new Uint8Array(buffer.slice(offset, offset + CHUNK_SIZE));
            peersList.forEach(peer => {
                if (peer.connected) {
                    try {
                        peer.send(chunk);
                    } catch (err) {
                        console.error("Failed to send chunk", err);
                    }
                }
            });

            offset += CHUNK_SIZE;
            setTransferProgress(Math.min(100, Math.round((offset / buffer.byteLength) * 100)));

            // Schedule next chunk to avoid blocking UI and flooding channel
            setTimeout(sendLoop, 10);
        };

        setTimeout(sendLoop, 100); // Start after meta
    };

    return (
        <Card className="glass border-0 h-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <span className="text-primary">📂</span> File Transfer
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-6">
                    <div className="p-6 border-2 border-dashed border-white/10 rounded-xl bg-secondary/20 hover:bg-secondary/30 transition-colors text-center space-y-4">
                        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl">
                            ☁️
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium">Click to select a file</p>
                            <p className="text-xs text-muted-foreground">P2P Transfer • End-to-End Encrypted</p>
                        </div>
                        <Input
                            type="file"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                            className="hidden"
                            id="file-upload"
                        />
                        <label
                            htmlFor="file-upload"
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-4 py-2 cursor-pointer w-full"
                        >
                            {file ? file.name : "Select File"}
                        </label>

                        <Button
                            onClick={sendFile}
                            disabled={!file || isTransferring}
                            className="w-full glass-button"
                        >
                            {isTransferring ? "Sending..." : "Send File"}
                        </Button>
                    </div>

                    {isTransferring && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                                <span>Transferring...</span>
                                <span>{transferProgress}%</span>
                            </div>
                            <Progress value={transferProgress} className="h-2" />
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Connected Peers</span>
                            <span className="bg-primary/20 text-primary px-2 py-0.5 rounded-full text-xs font-mono">
                                {Object.keys(peers).length}
                            </span>
                        </div>

                        {receivedFiles.length > 0 && (
                            <div className="space-y-3 pt-4 border-t border-white/5">
                                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Received Files</h4>
                                {receivedFiles.map((f, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-white/5 hover:border-primary/30 transition-all">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <span className="text-xl">📄</span>
                                            <span className="text-sm truncate max-w-[150px]">{f.name}</span>
                                        </div>
                                        <a
                                            href={f.url}
                                            download={f.name}
                                            className="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-md transition-colors"
                                        >
                                            Download
                                        </a>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
