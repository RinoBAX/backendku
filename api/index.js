// api/index.js
// Entry point utama aplikasi yang menggunakan Prisma ORM.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('./prisma'); // Import instance Prisma
const authenticateToken = require('./authMiddleware');

const app = express();

app.use(cors());
app.use(express.json());

// --- ROUTES ---

app.get('/', (req, res) => {
  res.status(200).json({ message: 'Selamat datang di API CRUD Express & Prisma!' });
});

// Route untuk Registrasi User Baru (contoh tambahan)
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username dan password dibutuhkan.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        username: username,
        password: hashedPassword,
      },
    });
    res.status(201).json({ id: newUser.id, username: newUser.username });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Username sudah digunakan.' });
    }
    console.error('Error saat registrasi:', error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});


// Route untuk Login (Public)
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (user && (await bcrypt.compare(password, user.password))) {
      const userPayload = { userId: user.id, username: user.username };
      const token = jwt.sign(userPayload, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.json({ message: "Login berhasil!", accessToken: token });
    } else {
      res.status(401).json({ message: 'Username atau password salah.' });
    }
  } catch (error) {
    console.error('Error saat login:', error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});


// --- CRUD ROUTES UNTUK 'PRODUK' (Dilindungi) ---

// 1. CREATE: Menambah produk baru
app.post('/produk', authenticateToken, async (req, res) => {
  const { nama, deskripsi, harga } = req.body;
  if (!nama || harga === undefined) {
    return res.status(400).json({ message: 'Nama dan harga produk wajib diisi.' });
  }

  try {
    const produkBaru = await prisma.produk.create({
      data: {
        nama,
        deskripsi,
        harga,
      },
    });
    res.status(201).json(produkBaru);
  } catch (error) {
    console.error('Error saat membuat produk:', error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// 2. READ: Mendapatkan semua produk
app.get('/produk', authenticateToken, async (req, res) => {
  try {
    const semuaProduk = await prisma.produk.findMany({
      orderBy: { id: 'desc' },
    });
    res.status(200).json(semuaProduk);
  } catch (error) {
    console.error('Error saat mengambil produk:', error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// 3. READ: Mendapatkan satu produk berdasarkan ID
app.get('/produk/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const produk = await prisma.produk.findUnique({
      where: { id: parseInt(id) },
    });
    if (produk) {
      res.status(200).json(produk);
    } else {
      res.status(404).json({ message: 'Produk tidak ditemukan.' });
    }
  } catch (error) {
    console.error(`Error saat mengambil produk ${id}:`, error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// 4. UPDATE: Memperbarui produk berdasarkan ID
app.put('/produk/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { nama, deskripsi, harga } = req.body;
  if (!nama || harga === undefined) {
    return res.status(400).json({ message: 'Nama dan harga produk wajib diisi.' });
  }

  try {
    const produkDiperbarui = await prisma.produk.update({
      where: { id: parseInt(id) },
      data: { nama, deskripsi, harga },
    });
    res.status(200).json(produkDiperbarui);
  } catch (error) {
    if (error.code === 'P2025') {
        return res.status(404).json({ message: 'Produk tidak ditemukan.' });
    }
    console.error(`Error saat memperbarui produk ${id}:`, error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// 5. DELETE: Menghapus produk berdasarkan ID
app.delete('/produk/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.produk.delete({
      where: { id: parseInt(id) },
    });
    res.status(200).json({ message: 'Produk berhasil dihapus.' });
  } catch (error) {
    if (error.code === 'P2025') {
        return res.status(404).json({ message: 'Produk tidak ditemukan.' });
    }
    console.error(`Error saat menghapus produk ${id}:`, error);
    res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
  }
});

// --- PENAMBAHAN UNTUK LOCAL DEVELOPMENT ---
// Cek jika file ini dijalankan langsung oleh Node.js (bukan oleh Vercel)
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 6969;
  app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  });
}

// Export aplikasi Express untuk Vercel
module.exports = app;
