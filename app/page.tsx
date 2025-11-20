"use client";

import { useState, useEffect } from "react";
import { RoomManager } from "@/components/RoomManager";
import { ClipboardManager } from "@/components/ClipboardManager";
import { FileTransfer } from "@/components/FileTransfer";
import { ApprovalToast } from "@/components/ApprovalToast";
import { getSocket } from "@/lib/socket";
import { toast } from "sonner";

export default function Home() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const [hostId, setHostId] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setIsConnected(true);
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onUserRequestingJoin = ({ socketId }: { socketId: string }) => {
      if (!roomId) return; // Should not happen if we are host
      toast.custom((t) => (
        <ApprovalToast
          socketId={socketId}
          roomId={roomId}
          onResolve={() => toast.dismiss(t)}
        />
      ), { duration: Infinity });
    };

    const onJoinApproved = ({ roomId, hostId }: { roomId: string; hostId: string }) => {
      toast.success("Join request approved!");
      setRoomId(roomId);
      setIsHost(false);
      setHostId(hostId);
    };

    const onJoinDenied = () => {
      toast.error("Host denied your request to join.");
      setRoomId(null);
      setIsHost(false);
      setHostId(null);
    };

    const onRoomClosed = () => {
      toast.warning("Room closed by host.");
      setRoomId(null);
      setIsHost(false);
      setHostId(null);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("user-requesting-join", onUserRequestingJoin);
    socket.on("join-approved", onJoinApproved);
    socket.on("join-denied", onJoinDenied);
    socket.on("room-closed", onRoomClosed);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("user-requesting-join", onUserRequestingJoin);
      socket.off("join-approved", onJoinApproved);
      socket.off("join-denied", onJoinDenied);
      socket.off("room-closed", onRoomClosed);
    };
  }, [roomId]);

  const handleJoin = (id: string, host: boolean) => {
    setRoomId(id);
    setIsHost(host);
    setHostId(null); // If I am host, I don't have a remote hostId
  };

  return (
    <main className="container mx-auto p-4 min-h-screen flex flex-col">
      {/* Header Status Bar */}
      <div className="flex justify-between items-center py-4 mb-6">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500 shadow-[0_0_10px_theme(colors.green.500)]" : "bg-red-500"}`} />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {isConnected ? "System Online" : "Reconnecting..."}
          </span>
        </div>
        {roomId && (
          <div className="px-3 py-1 rounded-full bg-secondary/50 backdrop-blur-sm border border-white/5 text-xs font-mono text-foreground/80">
            ID: <span className="font-bold text-primary">{roomId}</span>
          </div>
        )}
      </div>

      {!roomId ? (
        <RoomManager onJoin={handleJoin} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Left Column: Clipboard (8 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <ClipboardManager roomId={roomId} isHost={isHost} />
          </div>

          {/* Right Column: File Transfer (4 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <FileTransfer roomId={roomId} isHost={isHost} hostId={hostId} />
          </div>
        </div>
      )}
    </main>
  );
}
