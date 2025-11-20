"use client";

import { Button } from "@/components/ui/button";
import { getSocket } from "@/lib/socket";
import { toast } from "sonner";

interface ApprovalToastProps {
    socketId: string;
    roomId: string;
    onResolve: () => void;
}

export function ApprovalToast({ socketId, roomId, onResolve }: ApprovalToastProps) {
    const socket = getSocket();

    const handleApprove = () => {
        socket.emit("host-response", { roomId, socketId, approved: true });
        toast.success(`Approved user ${socketId}`);
        onResolve();
    };

    const handleDeny = () => {
        socket.emit("host-response", { roomId, socketId, approved: false });
        toast.info(`Denied user ${socketId}`);
        onResolve();
    };

    return (
        <div className="flex flex-col gap-2">
            <p className="font-medium">User {socketId.slice(0, 4)}... wants to join</p>
            <div className="flex gap-2">
                <Button size="sm" onClick={handleApprove}>Approve</Button>
                <Button size="sm" variant="destructive" onClick={handleDeny}>Deny</Button>
            </div>
        </div>
    );
}
