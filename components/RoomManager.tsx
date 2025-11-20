"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { getSocket } from "@/lib/socket";
import { v4 as uuidv4 } from 'uuid';

interface RoomManagerProps {
    onJoin: (roomId: string, isHost: boolean) => void;
}

export function RoomManager({ onJoin }: RoomManagerProps) {
    const [roomIdInput, setRoomIdInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isPending, setIsPending] = useState(false);

    const handleCreateRoom = () => {
        setIsLoading(true);
        const socket = getSocket();
        if (!socket.connected) socket.connect();

        const newRoomId = uuidv4().slice(0, 6); // Short code for easier typing

        socket.emit("create-room", newRoomId, (response: any) => {
            setIsLoading(false);
            if (response.success) {
                toast.success(`Room created: ${newRoomId}`);
                onJoin(newRoomId, true);
            } else {
                toast.error(response.message || "Failed to create room");
            }
        });
    };

    const handleJoinRoom = () => {
        if (!roomIdInput) return;
        setIsLoading(true);
        const socket = getSocket();
        if (!socket.connected) socket.connect();

        socket.emit("join-request", roomIdInput, (response: any) => {
            setIsLoading(false);
            if (response.success) {
                if (response.status === "joined") {
                    toast.success("Joined room successfully");
                    onJoin(roomIdInput, false);
                } else if (response.status === "pending") {
                    toast.info("Waiting for host approval...");
                    setIsPending(true);
                    // Do not call onJoin yet. Wait for approval event in parent.
                }
            } else {
                toast.error(response.message || "Failed to join room");
            }
        });
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] w-full max-w-md mx-auto space-y-8 animate-in fade-in zoom-in duration-500">
            <div className="text-center space-y-2">
                <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                    Clipboard Share
                </h1>
                <p className="text-muted-foreground">
                    Securely share text and files in real-time.
                </p>
            </div>

            <Card className="w-full glass border-0">
                <CardHeader>
                    <CardTitle className="text-center">Join or Create a Room</CardTitle>
                    <CardDescription className="text-center">
                        Enter a room code to join an existing session or create a new one.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {isPending ? (
                        <div className="flex flex-col items-center justify-center py-8 space-y-4">
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                            <p className="text-sm text-muted-foreground animate-pulse">Waiting for host approval...</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <Input
                                    placeholder="Enter Room Code"
                                    value={roomIdInput}
                                    onChange={(e) => setRoomIdInput(e.target.value)}
                                    className="glass-input text-center text-lg tracking-widest uppercase placeholder:normal-case placeholder:tracking-normal"
                                    maxLength={6}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <Button
                                    onClick={handleJoinRoom}
                                    disabled={!roomIdInput}
                                    variant="secondary"
                                    className="w-full hover:bg-secondary/80 transition-colors"
                                >
                                    Join Room
                                </Button>
                                <Button
                                    onClick={handleCreateRoom}
                                    className="w-full glass-button"
                                >
                                    Create Room
                                </Button>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
