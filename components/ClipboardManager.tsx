"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Textarea } from "@/components/ui/textarea";
import { ClipboardItem } from "@/types/types";
import { getSocket } from "@/lib/socket";
import { toast } from "sonner";

interface ClipboardManagerProps {
    roomId: string;
    isHost: boolean;
}

export function ClipboardManager({ roomId, isHost }: ClipboardManagerProps) {
    const [text, setText] = useState("");
    const [history, setHistory] = useState<ClipboardItem[]>([]);
    const socket = getSocket();

    useEffect(() => {
        if (!socket) return;

        socket.on("clipboard-updated", (data: { content: string; type: string; sender: string }) => {
            const newItem: ClipboardItem = {
                id: Date.now().toString(),
                content: data.content,
                type: data.type as "text" | "image" | "file",
                timestamp: Date.now(),
                sender: data.sender,
            };
            setHistory((prev) => {
                // Dedup: if latest item is same, don't add
                if (prev.length > 0 && prev[0].content === newItem.content) return prev;
                return [newItem, ...prev];
            });
            toast.info("New clipboard content received");
        });

        return () => {
            socket.off("clipboard-updated");
        };
    }, [socket]);

    const handleShare = () => {
        if (!text) return;

        socket.emit("clipboard-update", {
            roomId,
            content: text,
            type: "text",
        });

        // Add to own history
        const newItem: ClipboardItem = {
            id: Date.now().toString(),
            content: text,
            type: "text",
            timestamp: Date.now(),
            sender: "You",
        };
        setHistory((prev) => [newItem, ...prev]);
        setText("");
        toast.success("Shared to clipboard");
    };

    return (
        <div className="grid grid-cols-1 gap-6 h-full">
            <Card className="glass border-0 flex flex-col h-full min-h-[400px]">
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <span className="text-primary">📋</span> Shared Clipboard
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-4">
                    <Textarea
                        placeholder="Paste content here to share..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="flex-1 glass-input resize-none text-base p-4 min-h-[200px]"
                    />
                    <Button
                        onClick={handleShare}
                        className="w-full glass-button h-12 text-lg font-medium"
                    >
                        Share to Room
                    </Button>
                </CardContent>
            </Card>

            <Card className="glass border-0">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {history.length === 0 && (
                        <p className="text-center text-sm text-muted-foreground py-8 italic">No history yet.</p>
                    )}
                    {history.map((item) => (
                        <div
                            key={item.id}
                            className="group relative p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-white/5 transition-all duration-200"
                        >
                            <p className="text-sm whitespace-pre-wrap line-clamp-3 font-mono text-foreground/90">{item.content}</p>
                            <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/5">
                                <span className="text-[10px] text-muted-foreground">
                                    {new Date(item.timestamp).toLocaleTimeString()}
                                </span>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.sender === 'You' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                        {item.sender}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => {
                                            navigator.clipboard.writeText(item.content);
                                            toast.success("Copied to clipboard");
                                        }}
                                    >
                                        <span className="text-xs">📋</span>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
