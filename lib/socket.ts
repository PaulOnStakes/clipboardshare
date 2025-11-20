import { io, Socket } from "socket.io-client";

let socket: Socket;

export const getSocket = () => {
    if (!socket) {
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
        socket = io(socketUrl, {
            path: "/socket.io",
            autoConnect: false,
            // withCredentials: true, // Optional: might be needed depending on CORS setup
        });
    }
    return socket;
};
