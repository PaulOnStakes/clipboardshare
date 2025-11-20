export interface ClipboardItem {
    id: string;
    content: string;
    type: "text" | "image" | "file"; // simplified for now
    timestamp: number;
    sender: string;
}

export interface FileTransfer {
    id: string;
    name: string;
    size: number;
    progress: number;
    status: "pending" | "transferring" | "completed" | "error";
    blobUrl?: string;
}

export interface RoomState {
    roomId: string | null;
    isHost: boolean;
    status: "idle" | "pending" | "joined";
    members: string[];
}
