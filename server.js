const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;

// Middleware
app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint untuk upload file
app.post('/upload', (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).send('No files were uploaded.');
    }

    const uploadedFile = req.files.file;
    const uploadPath = path.join(__dirname, 'uploads', uploadedFile.name);

    uploadedFile.mv(uploadPath, (err) => {
        if (err) return res.status(500).send(err);
        res.send('File uploaded successfully!');

        // Mengirim notifikasi ke semua klien bahwa file baru tersedia
        io.emit('fileUploaded', { fileName: uploadedFile.name, filePath: `/uploads/${uploadedFile.name}` });
    });
});

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log('A client connected');
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const fs = require('fs');

app.get('/files', (req, res) => {
    fs.readdir(path.join(__dirname, 'uploads'), (err, files) => {
        if (err) return res.status(500).send('Failed to list files');
        res.json(files);
    });
});
