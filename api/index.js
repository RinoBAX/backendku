require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient, Prisma } = require('@prisma/client');
const { Decimal } = require('@prisma/client/runtime/library');
const authorize = require('./middleware/auth');
const { upload } = require('./config/cloudinary');

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());
app.post('/api/auth/register', async (req, res) => {
    const { nama, email, password, tglLahir, nomorTelepon, kecamatan, domisili, fotoKtp, kodeReferralUpline } = req.body;

    try {
        if (!nama || !email || !password) {
            return res.status(400).json({ message: 'Nama, email, dan password wajib diisi.' });
        }
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'Email sudah terdaftar.' });
        }

        let uplineId = null;
        if (kodeReferralUpline) {
            const upline = await prisma.user.findUnique({ where: { kodeReferral: kodeReferralUpline } });
            if (!upline) {
                return res.status(404).json({ message: 'Kode referral tidak valid.' });
            }
            uplineId = upline.id;
        }
        let newReferralCode = '';
        let isCodeUnique = false;
        const cleanName = nama.replace(/[^a-zA-Z]/g, '').toUpperCase();
        if (cleanName.length < 3) {
            return res.status(400).json({ message: 'Nama harus memiliki setidaknya 3 karakter huruf untuk membuat kode referral.' });
        }
        const firstThree = cleanName.slice(0, 3);
        const lastThree = cleanName.slice(-3);
        while (!isCodeUnique) {
            const generateRandomLetters = (length) => {
                const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                let result = '';
                const charactersLength = characters.length;
                for (let i = 0; i < length; i++) {
                    result += characters.charAt(Math.floor(Math.random() * charactersLength));
                }
                return result;
            };
            const randomNumber = Math.floor(Math.random() * 999) + 1; 
            const randomLetters = generateRandomLetters(3);
            const candidateCode = `${lastThree}${randomNumber}${firstThree}${randomLetters}`;
            const codeExists = await prisma.user.findUnique({
                where: { kodeReferral: candidateCode },
            });
            if (!codeExists) {
                newReferralCode = candidateCode;
                isCodeUnique = true;
            }
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: {
                nama,
                email,
                password: hashedPassword,
                tglLahir: tglLahir ? new Date(tglLahir) : null,
                nomorTelepon,
                kecamatan,
                domisili,
                fotoKtp,
                uplineId,
                kodeReferral: newReferralCode,
            },
            select: { id: true, nama: true, email: true, kodeReferral: true }
        });

        res.status(201).json(newUser);
    } catch (error) {
        console.error('Error saat registrasi:', error);
        if (error instanceof Prisma.PrismaClientValidationError) {
            return res.status(400).json({ message: 'Input tidak valid.', details: error.message });
        }
        res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ message: 'Email atau password salah.' });
        }

        if (user.statusRegistrasi !== 'APPROVED') {
            return res.status(403).json({ message: 'Akun Anda belum disetujui oleh admin.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Email atau password salah.' });
        }

        const userPayload = { userId: user.id };

        const accessToken = jwt.sign(userPayload, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ accessToken });

    } catch (error) {
        console.error('Error saat login:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
    }
});

// =============================================
// ROUTES - USER
// =============================================

app.get('/api/users/me', authorize(), async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                role: true,
                nama: true,
                email: true,
                picture: true,
                nomorTelepon: true,
                kecamatan: true,
                domisili: true,
                balance: true,
                kodeReferral: true,
                downlines: { select: { id: true, nama: true, email: true } },
                upline: { select: { id: true, nama: true, email: true } },
                transactions: { orderBy: { transactionDate: 'desc' } },
                submissions: { orderBy: { tglDibuat: 'desc' }, include: { project: { select: { namaProyek: true } } } }
            }
        });
        if (!user) {
            return res.status(404).json({ message: 'User tidak ditemukan.' });
        }
        res.json(user);
    } catch (error) {
        console.error('Error get /api/users/me:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
    }
});

app.put('/api/users/me/picture', authorize(), upload.single('picture'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Tidak ada file gambar yang diunggah.' });
    }

    try {
        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: { picture: req.file.path }
        });
        res.json({ message: 'Foto profil berhasil diperbarui.', pictureUrl: updatedUser.picture });
    } catch (error) {
        console.error('Error update picture:', error);
        res.status(500).json({ message: 'Gagal memperbarui foto profil.' });
    }
});


// =============================================
// ROUTES - PROJECTS & SUBMISSIONS
// =============================================

app.get('/api/projects', authorize(), async (req, res) => {
    try {
        const projects = await prisma.project.findMany({
            include: { 
                fields: true,
                creator: { select: { nama: true }},
                submissions: { select: { status: true }} 
            }
        });
        res.json(projects);
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengambil data proyek.' });
    }
});

app.post('/api/projects/:projectId/submit', authorize(), upload.any(), async (req, res) => {
    const { projectId } = req.params;
    const userId = req.user.id;

    try {
        const submission = await prisma.$transaction(async (tx) => {
            const newSubmission = await tx.submission.create({
                data: {
                    userId: userId,
                    projectId: parseInt(projectId),
                    status: 'PENDING',
                }
            });

            const projectFields = await tx.projectField.findMany({ where: { projectId: parseInt(projectId) } });
            const fieldMap = new Map(projectFields.map(f => [f.id.toString(), f]));

            const submissionValues = [];

            for (const key in req.body) {
                if (fieldMap.has(key)) {
                    submissionValues.push({
                        value: req.body[key],
                        submissionId: newSubmission.id,
                        projectFieldId: parseInt(key),
                    });
                }
            }

            if (req.files && req.files.length > 0) {
                req.files.forEach(file => {
                    if (fieldMap.has(file.fieldname)) {
                        submissionValues.push({
                            value: file.path,
                            submissionId: newSubmission.id,
                            projectFieldId: parseInt(file.fieldname),
                        });
                    }
                });
            }

            if (submissionValues.length > 0) {
                await tx.submissionValue.createMany({ data: submissionValues });
            }

            return newSubmission;
        });
        res.status(201).json({ message: 'Pengerjaan berhasil dikirim.', submission });
    } catch (error) {
        console.error("Error saat submit pengerjaan:", error);
        res.status(500).json({ message: 'Gagal mengirim pengerjaan.' });
    }
});


// =============================================
// ROUTES - ADMIN
// =============================================

app.post('/api/admin/projects', authorize(['ADMIN']), upload.single('icon'), async (req, res) => {
    // Karena menggunakan multipart/form-data, 'fields' akan menjadi string
    const { namaProyek, projectUrl, nilaiProyek, fields: fieldsString } = req.body;
    const creatorId = req.user.id;

    try {
        const fields = JSON.parse(fieldsString || '[]');
        if (!namaProyek || !nilaiProyek || !fields || !Array.isArray(fields)) {
            return res.status(400).json({ message: 'Data tidak lengkap.' });
        }

        const newProject = await prisma.project.create({
            data: {
                namaProyek,
                projectUrl,
                nilaiProyek: new Decimal(nilaiProyek),
                creatorId,
                // Handle ikon yang diunggah (opsional)
                iconUrl: req.file ? req.file.path : null,
                fields: {
                    create: fields.map(field => {
                        if (!field.label || !field.fieldType) {
                            throw new Error('Setiap field harus memiliki label dan fieldType.');
                        }
                        return {
                            label: field.label,
                            fieldType: field.fieldType,
                            isRequired: field.isRequired || true,
                        };
                    })
                }
            },
            include: { fields: true },
        });
        res.status(201).json(newProject);
    } catch (error) {
        console.error('Error saat membuat proyek:', error);
        res.status(500).json({ message: 'Gagal membuat proyek baru.' });
    }
});

app.put('/api/admin/users/:id/approve', authorize(['ADMIN']), async (req, res) => {
    try {
        const updatedUser = await prisma.user.update({
            where: { id: parseInt(req.params.id) },
            data: { statusRegistrasi: 'APPROVED' },
        });
        res.json({ message: 'Registrasi user berhasil disetujui.', user: updatedUser });
    } catch (error) {
        res.status(500).json({ message: 'Gagal menyetujui registrasi.' });
    }
});

app.put('/api/admin/users/:id/reject', authorize(['ADMIN']), async (req, res) => {
    try {
        const updatedUser = await prisma.user.update({
            where: { id: parseInt(req.params.id) },
            data: { statusRegistrasi: 'REJECTED' },
        });
        res.json({ message: 'Registrasi user berhasil ditolak.', user: updatedUser });
    } catch (error) {
        res.status(500).json({ message: 'Gagal menolak registrasi.' });
    }
});

app.put('/api/admin/projects/:id', authorize(['ADMIN']), upload.single('icon'), async (req, res) => {
    const projectId = parseInt(req.params.id);
    const { namaProyek, nilaiProyek, projectUrl, fields: fieldsString } = req.body;

    try {
        const fields = JSON.parse(fieldsString || '[]');
        const updatedProject = await prisma.$transaction(async (tx) => {
            const dataToUpdate = {
                namaProyek,
                nilaiProyek: new Decimal(nilaiProyek),
                projectUrl,
            };
            if (req.file) {
                dataToUpdate.iconUrl = req.file.path;
            }

            await tx.project.update({
                where: { id: projectId },
                data: dataToUpdate
            });

            await tx.projectField.deleteMany({
                where: { projectId: projectId },
            });

            if (fields && fields.length > 0) {
                await tx.projectField.createMany({
                    data: fields.map(field => ({
                        label: field.label,
                        fieldType: field.fieldType,
                        projectId: projectId,
                    })),
                });
            }

            return tx.project.findUnique({
                where: { id: projectId },
                include: { fields: true },
            });
        });

        res.json(updatedProject);
    } catch (error) {
        console.error(`Error updating project ${projectId}:`, error);
        res.status(500).json({ message: 'Gagal memperbarui proyek.' });
    }
});

app.delete('/api/admin/projects/:id', authorize(['ADMIN']), async (req, res) => {
    try {
        await prisma.project.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.status(204).send(); // No Content
    } catch (error) {
        res.status(500).json({ message: 'Gagal menghapus proyek.' });
    }
});

app.get('/api/admin/users', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
    const { status } = req.query; 
    try {
        const whereClause = {};
        if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
            whereClause.statusRegistrasi = status;
        }
        const users = await prisma.user.findMany({
            where: whereClause,
            include: {
                submissions: { select: { id: true } }
            },
            orderBy: { tglDibuat: 'desc' }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengambil data pengguna.' });
    }
});

app.get('/api/admin/submissions', authorize(['ADMIN']), async (req, res) => {
    const { status } = req.query;
    try {
        const whereClause = {};
        if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
            whereClause.status = status;
        }
        const submissions = await prisma.submission.findMany({
            where: whereClause,
            include: {
                user: { select: { nama: true } },
                project: { select: { namaProyek: true } }
            },
            orderBy: { tglDibuat: 'desc' }
        });
        res.json(submissions);
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengambil data submission.' });
    }
});

app.get('/api/admin/submissions/:id', authorize(['ADMIN']), async (req, res) => {
    const submissionId = parseInt(req.params.id);
    try {
        const submission = await prisma.submission.findUnique({
            where: { id: submissionId },
            include: {
                user: { select: { nama: true } },
                project: { select: { namaProyek: true } },
                values: {
                    include: {
                        projectField: true,
                    },
                },
            },
        });

        if (!submission) {
            return res.status(404).json({ message: 'Submission tidak ditemukan.' });
        }

        res.json(submission);
    } catch (error) {
        console.error(`Gagal mengambil detail submission ${submissionId}:`, error);
        res.status(500).json({ message: 'Gagal mengambil detail submission.' });
    }
});

app.put('/api/admin/submissions/:id/approve', authorize(['ADMIN']), async (req, res) => {
    const submissionId = parseInt(req.params.id);
    try {
        const updatedSubmission = await prisma.$transaction(async (tx) => {
            // 1. Ambil data submission, proyek, dan user (termasuk 2 level upline)
            const submission = await tx.submission.findUnique({
                where: { id: submissionId },
                include: {
                    project: true,
                    user: { 
                        include: { 
                            upline: { 
                                include: { 
                                    upline: true 
                                } 
                            } 
                        } 
                    }
                }
            });

            if (!submission) throw new Error('Submission tidak ditemukan.');
            if (submission.status !== 'PENDING') throw new Error('Submission ini sudah pernah diproses.');

            const { user: pengerja, project } = submission;
            const nilaiProyek = new Decimal(project.nilaiProyek);

            // 2. Tambah saldo & buat transaksi untuk pengerja
            await tx.user.update({
                where: { id: pengerja.id },
                data: { balance: { increment: nilaiProyek } },
            });
            await tx.transaction.create({
                data: { 
                    tipe: 'PENGERJAAN_PROYEK', 
                    jumlah: nilaiProyek, 
                    deskripsi: `Bonus pengerjaan proyek: ${project.namaProyek}`, 
                    userId: pengerja.id, 
                    submissionId: submission.id 
                }
            });

            // 3. Proses komisi untuk Upline Level 1
            const uplineL1 = pengerja.upline;
            if (uplineL1) {
                const komisiL1 = nilaiProyek.mul(0.10); // Komisi 10%
                await tx.user.update({ where: { id: uplineL1.id }, data: { balance: { increment: komisiL1 } } });
                await tx.transaction.create({ 
                    data: { 
                        tipe: 'KOMISI_UPLINE_1', 
                        jumlah: komisiL1, 
                        deskripsi: `Komisi dari downline: ${pengerja.nama}`, 
                        userId: uplineL1.id, 
                        submissionId: submission.id 
                    } 
                });

                // 4. Proses komisi untuk Upline Level 2
                const uplineL2 = uplineL1.upline;
                if (uplineL2) {
                    const komisiL2 = nilaiProyek.mul(0.01); // Komisi 1%
                    await tx.user.update({ where: { id: uplineL2.id }, data: { balance: { increment: komisiL2 } } });
                    await tx.transaction.create({ 
                        data: { 
                            tipe: 'KOMISI_UPLINE_2', 
                            jumlah: komisiL2, 
                            deskripsi: `Komisi dari downline level 2: ${pengerja.nama}`, 
                            userId: uplineL2.id, 
                            submissionId: submission.id 
                        } 
                    });
                }
            }

            const operationalBonuses = [
                { refCode: 'BAXRINO010817', amount: 1000 },
                { refCode: 'BAXFRIANDRE01', amount: 1000 },
                { refCode: 'BAXSULTAN0069', amount: 500 }
            ];

            for (const bonus of operationalBonuses) {
                const operationalUser = await tx.user.findUnique({
                    where: { kodeReferral: bonus.refCode }
                });

                if (operationalUser) {
                    const bonusAmount = new Decimal(bonus.amount);
                    await tx.user.update({
                        where: { id: operationalUser.id },
                        data: { balance: { increment: bonusAmount } }
                    });
                    await tx.transaction.create({
                        data: {
                            tipe: 'BONUS_OPERASIONAL', 
                            jumlah: bonusAmount,
                            deskripsi: `Bonus operasional dari persetujuan submission ID: ${submission.id}`,
                            userId: operationalUser.id,
                            submissionId: submission.id
                        }
                    });
                }
            }

            return tx.submission.update({
                where: { id: submissionId },
                data: { status: 'APPROVED' },
            });
        });
        
        res.json({ message: `Submission ID ${submissionId} berhasil disetujui.`, submission: updatedSubmission });
    } catch (error) {
        console.error(`Gagal menyetujui submission ${submissionId}:`, error);
        res.status(500).json({ message: error.message || 'Gagal memproses persetujuan.' });
    }
});

app.put('/api/admin/submissions/:id/reject', authorize(['ADMIN']), async (req, res) => {
    const { catatanAdmin } = req.body;
    try {
        const submission = await prisma.submission.update({
            where: { id: parseInt(req.params.id) },
            data: { status: 'REJECTED', catatanAdmin }
        });
        res.json({ message: 'Submission berhasil ditolak.', submission });
    } catch (error) {
        res.status(500).json({ message: 'Gagal menolak submission.' });
    }
});


// =============================================
// ROUTES - SUPER ADMIN
// =============================================

app.get('/api/superadmin/withdrawals', authorize(['SUPER_ADMIN']), async (req, res) => {
    const { status } = req.query;
    try {
        const whereClause = {};
        if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
            whereClause.status = status;
        }
        const withdrawals = await prisma.withdrawal.findMany({
            where: whereClause,
            include: { user: { select: { nama: true } } },
            orderBy: { tglDiajukan: 'desc' }
        });
        res.json(withdrawals);
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengambil data penarikan.' });
    }
});

app.put('/api/superadmin/withdrawals/:id/approve', authorize(['SUPER_ADMIN']), async (req, res) => {
    const withdrawalId = parseInt(req.params.id);
    try {
        await prisma.$transaction(async (tx) => {
            const withdrawal = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });

            if (!withdrawal) throw new Error('Permintaan penarikan tidak ditemukan.');
            if (withdrawal.status !== 'PENDING') throw new Error('Permintaan ini sudah diproses.');

            const user = await tx.user.findUnique({ where: { id: withdrawal.userId } });
            if (new Decimal(user.balance).lessThan(withdrawal.totalWithdrawal)) {
                throw new Error('Saldo pengguna tidak mencukupi untuk penarikan ini.');
            }
            await tx.user.update({
                where: { id: withdrawal.userId },
                data: { balance: { decrement: withdrawal.totalWithdrawal } }
            });
            await tx.transaction.create({
                data: { tipe: 'PENARIKAN_DANA', jumlah: withdrawal.totalWithdrawal.negated(), deskripsi: 'Penarikan dana', userId: withdrawal.userId, withdrawalId: withdrawal.id }
            });
            await tx.withdrawal.update({
                where: { id: withdrawalId },
                data: { status: 'APPROVED', tglDiproses: new Date() }
            });
        });
        res.json({ message: 'Permintaan penarikan berhasil disetujui.' });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Gagal menyetujui penarikan.' });
    }
});


// =============================================
// SERVER START
// =============================================
const PORT = process.env.PORT || 6969;
app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});

module.exports = app;
