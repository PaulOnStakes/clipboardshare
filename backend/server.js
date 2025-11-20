const { createServer } = require("http");
const { Server } = require("socket.io");

const port = process.env.PORT || 3001;

const httpServer = createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Clipboard Share Backend Running');
});

const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow all origins for simplicity in this migration, or configure as needed
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Room State Management
const rooms = new Map(); // roomId -> { hostId, members: Set<socketId>, pending: Set<socketId> }

io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Create Room
    socket.on("create-room", (roomId, callback) => {
        if (rooms.has(roomId)) {
            callback({ success: false, message: "Room already exists" });
            return;
        }
        rooms.set(roomId, {
            hostId: socket.id,
            members: new Set([socket.id]),
            pending: new Set(),
        });
        socket.join(roomId);
        callback({ success: true, isHost: true });
        console.log(`Room created: ${roomId} by ${socket.id}`);
    });

    // Join Room Request
    socket.on("join-request", (roomId, callback) => {
        const room = rooms.get(roomId);
        if (!room) {
            callback({ success: false, message: "Room not found" });
            return;
        }

        // If already a member, just rejoin
        if (room.members.has(socket.id)) {
            socket.join(roomId);
            callback({ success: true, status: "joined" });
            return;
        }

        // Add to pending
        room.pending.add(socket.id);
        // Notify Host
        io.to(room.hostId).emit("user-requesting-join", { socketId: socket.id });
        callback({ success: true, status: "pending" });
        console.log(`Join request for ${roomId} from ${socket.id}`);
    });

    // Host Response (Approve/Deny)
    socket.on("host-response", ({ roomId, socketId, approved }) => {
        const room = rooms.get(roomId);
        if (!room || room.hostId !== socket.id) return;

        if (room.pending.has(socketId)) {
            room.pending.delete(socketId);
            if (approved) {
                room.members.add(socketId);
                const targetSocket = io.sockets.sockets.get(socketId);
                if (targetSocket) {
                    targetSocket.join(roomId);
                    targetSocket.emit("join-approved", { roomId, hostId: room.hostId });
                }
            } else {
                const targetSocket = io.sockets.sockets.get(socketId);
                if (targetSocket) {
                    targetSocket.emit("join-denied");
                }
            }
        }
    });

    // Clipboard Sync
    socket.on("clipboard-update", ({ roomId, content, type }) => {
        // Broadcast to everyone else in the room
        socket.to(roomId).emit("clipboard-updated", { content, type, sender: socket.id });
    });

    // WebRTC Signaling
    socket.on("signal", ({ target, signal, roomId }) => {
        console.log(`Signaling: ${socket.id} -> ${target} (${signal.type})`);
        io.to(target).emit("signal", { sender: socket.id, signal });
    });

    socket.on("disconnect", () => {
        // Cleanup rooms where user is host
        rooms.forEach((room, roomId) => {
            if (room.hostId === socket.id) {
                io.to(roomId).emit("room-closed");
                rooms.delete(roomId);
            } else {
                room.members.delete(socket.id);
                room.pending.delete(socket.id);
            }
        });
        console.log("Client disconnected:", socket.id);
    });
});

httpServer.listen(port, () => {
    console.log(`> Backend ready on port ${port}`);
});
