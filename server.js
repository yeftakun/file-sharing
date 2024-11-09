const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;

// Get local IP address
function getLocalIPAddress() {
    const networkInterfaces = os.networkInterfaces();
    for (const interfaceName in networkInterfaces) {
        for (const interfaceInfo of networkInterfaces[interfaceName]) {
            if (interfaceInfo.family === 'IPv4' && !interfaceInfo.internal) {
                return interfaceInfo.address;
            }
        }
    }
    return '127.0.0.1';
}

// Hapus semua folder sesi di direktori 'uploads' saat server dimulai
function deleteAllSessions() {
    const uploadDir = path.join(__dirname, 'uploads');
    fs.readdirSync(uploadDir).forEach((folder) => {
        const folderPath = path.join(uploadDir, folder);
        if (fs.lstatSync(folderPath).isDirectory()) {
            fs.rmSync(folderPath, { recursive: true, force: true });
            console.log(`Deleted session folder: ${folderPath}`);
        }
    });
}

// Menghapus semua sesi saat server dimulai
deleteAllSessions();

app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const sessions = {};

// Helper to update clients with the list of connected IPs
function updateClientList(sessionId) {
    const connectedIPs = sessions[sessionId].clients.map(client => client.ip);
    io.to(sessionId).emit('updateClientList', connectedIPs);
}

// Create or join session
io.on('connection', (socket) => {
    let sessionId = null;
    const clientIp = socket.handshake.address.replace(/^.*:/, ''); // Mengambil alamat IP klien

    socket.on('createSession', (id, callback) => {
        if (sessions[id]) return callback(true);
        sessions[id] = { clients: [], files: [] };
        fs.mkdirSync(path.join(__dirname, 'uploads', id), { recursive: true });
        sessionId = id;
        socket.join(id);
        callback(false);
    });

    socket.on('joinSession', (id, callback) => {
        if (!sessions[id]) return callback(false);
        sessions[id].clients.push({ id: socket.id, ip: clientIp });
        socket.join(id);
        sessionId = id;
        callback(true);
        updateClientList(sessionId); // Perbarui daftar klien setelah bergabung
    });

    // Handle client disconnect (close tab or lose connection)
    socket.on('disconnect', () => {
        if (sessionId && sessions[sessionId]) {
            sessions[sessionId].clients = sessions[sessionId].clients.filter(client => client.id !== socket.id);
            if (sessions[sessionId].clients.length === 0) {
                deleteSession(sessionId);
            } else {
                updateClientList(sessionId); // Perbarui daftar klien setelah pemutusan
            }
        }
    });

    // Handle file upload and notify other clients in the session
    socket.on('fileUploaded', (sessionId, fileName) => {
        io.to(sessionId).emit('fileUploaded', { fileName });
    });
});

// Delete session and its files
function deleteSession(sessionId) {
    if (sessions[sessionId]) {
        // Kirim alert "Sesi terputus" ke semua klien di sesi tersebut
        io.to(sessionId).emit('sessionEnded', 'Sesi berakhir karena salah satu klien telah keluar.');

        // Hapus folder dan sesi dari memori server
        fs.rmSync(path.join(__dirname, 'uploads', sessionId), { recursive: true, force: true });
        delete sessions[sessionId];
        console.log(`Session ${sessionId} and its files have been deleted.`);
    }
}

// Handle file upload endpoint
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
    console.log(`Server running at http://${getLocalIPAddress()}:${PORT}`);
});
