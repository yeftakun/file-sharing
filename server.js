const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;

app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const sessions = {};

// Create or join session
io.on('connection', (socket) => {
    socket.on('createSession', (sessionId, callback) => {
        if (sessions[sessionId]) return callback(true);
        sessions[sessionId] = { clients: [], files: [] };
        fs.mkdirSync(path.join(__dirname, 'uploads', sessionId), { recursive: true });
        socket.join(sessionId);
        callback(false);
    });

    socket.on('joinSession', (sessionId, callback) => {
        if (!sessions[sessionId]) return callback(false);
        sessions[sessionId].clients.push(socket.id);
        socket.join(sessionId);
        callback(true);
    });

    socket.on('leaveSession', (sessionId, callback) => {
        socket.leave(sessionId);
        if (sessions[sessionId]) {
            sessions[sessionId].clients = sessions[sessionId].clients.filter(id => id !== socket.id);
            if (sessions[sessionId].clients.length === 0) {
                deleteSession(sessionId);
            }
        }
        callback();
    });
});

function deleteSession(sessionId) {
    fs.rmSync(path.join(__dirname, 'uploads', sessionId), { recursive: true, force: true });
    delete sessions[sessionId];
}

// Upload files to session
app.post('/upload/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    if (!sessions[sessionId]) return res.status(404).send('Session not found');

    if (!req.files || !req.files.files) return res.status(400).send('No files were uploaded');
    const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];

    files.forEach(file => {
        const uploadPath = path.join(__dirname, 'uploads', sessionId, file.name);
        file.mv(uploadPath, (err) => {
            if (err) return res.status(500).send(err);
            io.to(sessionId).emit('fileUploaded', { fileName: file.name });
        });
    });
    res.send('Files uploaded successfully!');
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
