// api/index.js

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('@prisma/client/runtime/library');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs'); // Menggunakan bcryptjs sesuai package.json
const jwt = require('jsonwebtoken');

// Inisialisasi Express App dan Prisma Client
const app = express();
const prisma = new PrismaClient();

// Konfigurasi Variabel Lingkungan (Sangat Penting untuk Keamanan)
// Pastikan Anda memiliki file .env dengan nilai untuk JWT_SECRET
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET || 'mwehehehe';


// Middleware untuk parsing JSON body
app.use(express.json());

// Konfigurasi Multer untuk file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Di lingkungan serverless, gunakan /tmp untuk penyimpanan sementara
    cb(null, '/tmp/uploads');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Middleware untuk menyajikan file statis dari folder 'uploads'
// Ini mungkin tidak bekerja seperti yang diharapkan di lingkungan serverless tanpa konfigurasi tambahan.
// Sebaiknya gunakan layanan storage pihak ketiga seperti AWS S3 atau Cloudinary.
app.use('/uploads', express.static('/tmp/uploads'));


// =================================================================
// == MIDDLEWARE KEAMANAN
// =================================================================

/**
 * Middleware untuk memverifikasi JWT (JSON Web Token).
 * Melindungi rute yang memerlukan autentikasi.
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) {
        return res.sendStatus(401); // Unauthorized
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.sendStatus(403); // Forbidden, token tidak valid
        }
        req.user = user; // Menyimpan payload token (misal: { id, email, role }) ke request
        next();
    });
};

/**
 * Middleware untuk memverifikasi peran Admin.
 * Harus digunakan SETELAH authenticateToken.
 * CATATAN: Pastikan model User di schema.prisma Anda memiliki field `role` (misal: `role Role @default(USER)` dengan enum `enum Role { USER ADMIN }`)
 */
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'ADMIN') {
        console.log("Akses admin dikonfirmasi untuk:", req.user.email);
        next();
    } else {
        res.status(403).json({ error: 'Akses ditolak. Hanya untuk admin.' });
    }
};


// =================================================================
// == RUTE AUTENTIKASI
// =================================================================

/**
 * Registrasi pengguna baru dengan password hashing.
 */
app.post('/api/register', async (req, res) => {
  const { nama, email, password, picture, kodeReferralUpline } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email sudah terdaftar.' });
    }

    let uplineId = null;
    if (kodeReferralUpline) {
      const upline = await prisma.user.findUnique({
        where: { kodeReferral: kodeReferralUpline },
      });
      if (!upline) {
        return res.status(404).json({ error: 'Kode referral tidak valid.' });
      }
      uplineId = upline.id;
    }

    // Hash password menggunakan bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = await prisma.user.create({
      data: {
        nama,
        email,
        password: hashedPassword, // Simpan password yang sudah di-hash
        picture,
        uplineId: uplineId,
      },
    });

    res.status(201).json({ id: newUser.id, nama: newUser.nama, email: newUser.email });
  } catch (error) {
    console.error('Error saat registrasi:', error);
    res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  }
});

/**
 * Login pengguna dan mengembalikan JWT.
 */
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: 'Email atau password salah.' });
        }

        // Bandingkan password yang diberikan dengan hash di database
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Email atau password salah.' });
        }
        
        // Jangan sertakan password dalam token
        const userPayload = {
            id: user.id,
            email: user.email,
            role: user.role, // Pastikan field 'role' ada di model User Anda
        };

        // Buat token JWT
        const accessToken = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '1d' }); // Token berlaku 1 hari

        res.json({ accessToken });

    } catch (error) {
        console.error('Error saat login:', error);
        res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
    }
});


// =================================================================
// == API ENDPOINTS (DILINDUNGI)
// =================================================================

/**
 * Mendapatkan detail pengguna yang sedang login.
 */
app.get('/api/me', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: {
                downlines: { select: { id: true, nama: true, email: true } },
                upline: { select: { id: true, nama: true, email: true } },
                transactions: { orderBy: { transactionDate: 'desc' } },
            }
        });
        if (!user) {
            return res.status(404).json({ error: 'User tidak ditemukan.' });
        }
        // Hapus password dari objek respons
        const { password, ...userData } = user;
        res.json(userData);
    } catch (error) {
        res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
    }
});


// --- RUTE PROYEK (DILINDUNGI) ---

app.get('/api/projects', authenticateToken, async (req, res) => {
    try {
        const projects = await prisma.project.findMany({
            include: {
                fields: true
            }
        });
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: 'Gagal mengambil data proyek.' });
    }
});

app.post('/api/projects/:projectId/submit', authenticateToken, upload.any(), async (req, res) => {
    const { projectId } = req.params;
    const userId = req.user.id; // Ambil userId dari token yang sudah diautentikasi

    try {
        const submission = await prisma.$transaction(async (tx) => {
            const newSubmission = await tx.projectSubmission.create({
                data: {
                    userId: userId,
                    projectId: parseInt(projectId),
                    status: 'PENDING',
                }
            });

            const submissionData = [];
            for (const key in req.body) {
                if (!isNaN(parseInt(key))) {
                    submissionData.push({
                        nilai: req.body[key],
                        submissionId: newSubmission.id,
                        fieldId: parseInt(key),
                    });
                }
            }

            if (req.files && req.files.length > 0) {
                req.files.forEach(file => {
                    if (!isNaN(parseInt(file.fieldname))) {
                         submissionData.push({
                            nilai: file.path,
                            submissionId: newSubmission.id,
                            fieldId: parseInt(file.fieldname),
                        });
                    }
                });
            }

            await tx.submissionData.createMany({ data: submissionData });
            return newSubmission;
        });
        res.status(201).json({ message: 'Pengerjaan berhasil dikirim.', submission });
    } catch (error) {
        console.error("Error saat submit pengerjaan:", error);
        res.status(500).json({ error: 'Gagal mengirim pengerjaan.' });
    }
});


// --- RUTE PENARIKAN (DILINDUNGI) ---

app.post('/api/withdrawals', authenticateToken, async (req, res) => {
    const { totalWithdrawal } = req.body;
    const userId = req.user.id; // Ambil userId dari token

    try {
        const user = await prisma.user.findUnique({ where: { id: userId }});
        if (!user) {
            return res.status(404).json({ error: 'User tidak ditemukan.' });
        }

        if (new Decimal(user.balance).lessThan(new Decimal(totalWithdrawal))) {
            return res.status(400).json({ error: 'Saldo tidak mencukupi.' });
        }

        const withdrawal = await prisma.withdrawal.create({
            data: {
                userId: userId,
                totalWithdrawal: new Decimal(totalWithdrawal),
                status: 'PENDING',
            }
        });
        res.status(201).json({ message: 'Permintaan penarikan berhasil diajukan.', withdrawal });
    } catch (error) {
        res.status(500).json({ error: 'Gagal mengajukan penarikan.' });
    }
});


// =================================================================
// == RUTE KHUSUS ADMIN (DILINDUNGI)
// =================================================================

app.put('/api/admin/users/:id/approve', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const updatedUser = await prisma.user.update({
            where: { id: parseInt(id) },
            data: { statusRegistrasi: 'APPROVED' },
        });
        res.json({ message: 'Registrasi user berhasil disetujui.', user: updatedUser });
    } catch (error) {
        res.status(500).json({ error: 'Gagal menyetujui registrasi.' });
    }
});

app.put('/api/admin/submissions/:id/approve', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.$transaction(async (tx) => {
            const submission = await tx.projectSubmission.findUnique({
                where: { id: parseInt(id) },
                include: {
                    project: true,
                    user: { include: { upline: { include: { upline: true } } } }
                }
            });

            if (!submission) throw new Error('Submission tidak ditemukan.');
            if (submission.status !== 'PENDING') throw new Error('Submission ini sudah diproses.');

            const pengerja = submission.user;
            const project = submission.project;
            const nilaiProyek = project.nilaiProyek;

            await tx.user.update({
                where: { id: pengerja.id },
                data: { balance: { increment: nilaiProyek } },
            });
            await tx.transaction.create({
                data: { tipe: 'PENGERJAAN', jumlah: nilaiProyek, userId: pengerja.id, submissionId: submission.id }
            });

            const uplineL1 = pengerja.upline;
            if (uplineL1) {
                const komisiL1 = nilaiProyek.mul(0.10);
                await tx.user.update({ where: { id: uplineL1.id }, data: { balance: { increment: komisiL1 } } });
                await tx.transaction.create({ data: { tipe: 'KOMISI_UPLINE1', jumlah: komisiL1, userId: uplineL1.id, submissionId: submission.id } });

                const uplineL2 = uplineL1.upline;
                if (uplineL2) {
                    const komisiL2 = nilaiProyek.mul(0.01);
                    await tx.user.update({ where: { id: uplineL2.id }, data: { balance: { increment: komisiL2 } } });
                    await tx.transaction.create({ data: { tipe: 'KOMISI_UPLINE2', jumlah: komisiL2, userId: uplineL2.id, submissionId: submission.id } });
                }
            }

            await tx.projectSubmission.update({
                where: { id: submission.id },
                data: { status: 'APPROVED', tglDiproses: new Date() },
            });
        });
        res.json({ message: `Submission ID ${id} berhasil disetujui.` });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Gagal menyetujui pengerjaan.' });
    }
});

app.put('/api/admin/submissions/:id/reject', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { noteAdmin } = req.body;
    try {
        const submission = await prisma.projectSubmission.update({
            where: { id: parseInt(id) },
            data: { status: 'REJECTED', noteAdmin: noteAdmin, tglDiproses: new Date() }
        });
        res.json({ message: 'Submission berhasil ditolak.', submission });
    } catch (error) {
        res.status(500).json({ error: 'Gagal menolak submission.' });
    }
});

app.put('/api/admin/withdrawals/:id/approve', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.$transaction(async (tx) => {
            const withdrawal = await tx.withdrawal.findUnique({ where: { id: parseInt(id) } });

            if (!withdrawal) throw new Error('Permintaan penarikan tidak ditemukan.');
            if (withdrawal.status !== 'PENDING') throw new Error('Permintaan ini sudah diproses.');

            await tx.user.update({
                where: { id: withdrawal.userId },
                data: { balance: { decrement: withdrawal.totalWithdrawal } }
            });
            await tx.transaction.create({
                data: { tipe: 'PENARIKAN', jumlah: withdrawal.totalWithdrawal, userId: withdrawal.userId, withdrawalId: withdrawal.id }
            });
            await tx.withdrawal.update({
                where: { id: withdrawal.id },
                data: { status: 'APPROVED', tglDiproses: new Date() }
            });
        });
        res.json({ message: 'Permintaan penarikan berhasil disetujui.' });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Gagal menyetujui penarikan.' });
    }
});

// Ekspor app untuk digunakan oleh Vercel
module.exports = app;

// Jalankan server
const PORT = process.env.PORT || 6969;
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});