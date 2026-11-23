const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 10 * 1024 * 1024 // 10MB for photos/files
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Connected users keyed by socket.id
const usersBySocket = new Map();
// Lookup socket.id by @handle
const socketByHandle = new Map();

function broadcastUsers() {
  const list = Array.from(usersBySocket.values());
  io.emit('users_update', list);
}

io.on('connection', (socket) => {
  socket.on('register', (profile) => {
    if (!profile || !profile.handle) return;
    const prev = usersBySocket.get(socket.id);
    if (prev && prev.handle) {
      socketByHandle.delete(prev.handle);
    }

    const handle = String(profile.handle).toLowerCase();
    const user = {
      id: socket.id,
      name: String(profile.name || handle).slice(0, 24),
      handle,
      color: profile.color || '#6366f1'
    };

    usersBySocket.set(socket.id, user);
    socketByHandle.set(handle, socket.id);
    broadcastUsers();
  });

  // Direct message to @handle
  socket.on('dm_message', (data) => {
    const sender = usersBySocket.get(socket.id);
    if (!sender || !data || !data.toHandle) return;
    const targetId = socketByHandle.get(String(data.toHandle).toLowerCase());
    if (!targetId) return;

    io.to(targetId).emit('dm_message', {
      msgId: data.msgId,
      fromHandle: sender.handle,
      fromName: sender.name,
      fromColor: sender.color,
      text: data.text || '',
      replyTo: data.replyTo || null,
      attachment: data.attachment || null,
      voiceNote: data.voiceNote || null
    });
  });

  // Group message broadcast
  socket.on('group_message', (data) => {
    socket.broadcast.emit('group_message', data);
  });

  // Typing indicator
  socket.on('typing', (data) => {
    const sender = usersBySocket.get(socket.id);
    if (!sender || !data) return;
    if (data.toHandle) {
      const targetId = socketByHandle.get(String(data.toHandle).toLowerCase());
      if (targetId) {
        io.to(targetId).emit('typing', {
          fromHandle: sender.handle,
          fromName: sender.name,
          toHandle: data.toHandle
        });
      }
    } else {
      socket.broadcast.emit('typing', {
        fromHandle: sender.handle,
        fromName: sender.name,
        chatId: data.chatId
      });
    }
  });

  // Emoji reaction
  socket.on('reaction', (data) => {
    const sender = usersBySocket.get(socket.id);
    if (!sender || !data) return;
    if (data.toHandle) {
      const targetId = socketByHandle.get(String(data.toHandle).toLowerCase());
      if (targetId) {
        io.to(targetId).emit('reaction', {
          fromHandle: sender.handle,
          toHandle: data.toHandle,
          msgId: data.msgId,
          emoji: data.emoji
        });
      }
    } else {
      socket.broadcast.emit('reaction', data);
    }
  });

  // Automatic WebRTC Voice Call Signaling by @handle
  socket.on('webrtc_offer', (data) => {
    const sender = usersBySocket.get(socket.id);
    if (!sender || !data || !data.toHandle) return;
    const targetId = socketByHandle.get(String(data.toHandle).toLowerCase());
    if (targetId) {
      io.to(targetId).emit('webrtc_offer', {
        fromHandle: sender.handle,
        fromName: sender.name,
        fromColor: sender.color,
        offer: data.offer
      });
    }
  });

  socket.on('webrtc_answer', (data) => {
    const sender = usersBySocket.get(socket.id);
    if (!sender || !data || !data.toHandle) return;
    const targetId = socketByHandle.get(String(data.toHandle).toLowerCase());
    if (targetId) {
      io.to(targetId).emit('webrtc_answer', {
        fromHandle: sender.handle,
        answer: data.answer
      });
    }
  });

  socket.on('webrtc_ice', (data) => {
    const sender = usersBySocket.get(socket.id);
    if (!sender || !data || !data.toHandle) return;
    const targetId = socketByHandle.get(String(data.toHandle).toLowerCase());
    if (targetId) {
      io.to(targetId).emit('webrtc_ice', {
        fromHandle: sender.handle,
        candidate: data.candidate
      });
    }
  });

  socket.on('disconnect', () => {
    const user = usersBySocket.get(socket.id);
    if (user && user.handle) {
      socketByHandle.delete(user.handle);
    }
    usersBySocket.delete(socket.id);
    broadcastUsers();
  });
});

server.listen(PORT, () => {
  console.log(`SesliOda sunucusu çalışıyor: http://localhost:${PORT}`);
});
