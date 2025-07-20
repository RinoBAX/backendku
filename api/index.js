require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient, Prisma } = require('@prisma/client');
const { Decimal } = require('@prisma/client/runtime/library');
const authorize = require('./middleware/auth');
const { upload } = require('./config/s3');

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/auth/logout', authorize(), async (req, res) => {
    res.status(200).json({ message: 'Logout berhasil, sultan konyol wkwkwk.' });
});


app.post('/api/auth/register', async (req, res) => {
    const { nama, email, password, tglLahir, nomorTelepon, kecamatan, domisili, fotoKtp, bankName, noRekening, kodeReferralUpline } = req.body;
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
            if (!upline) return res.status(404).json({ message: 'Kode referral tidak valid.' });
            uplineId = upline.id;
        }
        const cleanName = nama.replace(/[^a-zA-Z]/g, '').toUpperCase();
        if (cleanName.length < 3) return res.status(400).json({ message: 'Nama harus memiliki setidaknya 3 karakter huruf.' });

        let newReferralCode = '';
        let isCodeUnique = false;
        const firstThree = cleanName.slice(0, 3);
        const lastThree = cleanName.slice(-3);
        while (!isCodeUnique) {
            const randomNumber = Math.floor(Math.random() * 999) + 1;
            const randomLetters = Array.from({ length: 3 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]).join('');
            const candidateCode = `${lastThree}${randomNumber}${firstThree}${randomLetters}`;
            const codeExists = await prisma.user.findUnique({ where: { kodeReferral: candidateCode } });
            if (!codeExists) {
                newReferralCode = candidateCode;
                isCodeUnique = true;
            }
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: {
                nama, email, password: hashedPassword, tglLahir: tglLahir ? new Date(tglLahir) : null,
                nomorTelepon, kecamatan, domisili, fotoKtp, uplineId, kodeReferral: newReferralCode,
                bankName: bankName || 'EMPTY',
                noRekening
            },
            select: { id: true, nama: true, email: true, kodeReferral: true }
        });
        res.status(201).json(newUser);
    } catch (error) {
        console.error('Error saat registrasi:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(401).json({ message: 'Email atau password salah.' });
        if (user.statusRegistrasi !== 'APPROVED') return res.status(403).json({ message: 'Akun Anda belum disetujui oleh admin.' });
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) return res.status(401).json({ message: 'Email atau password salah.' });
        const userPayload = { userId: user.id };
        const accessToken = jwt.sign(userPayload, process.env.JWT_SECRET, { expiresIn: '4h' });
        res.json({
            ...user,
            accessToken
        });
    } catch (error) {
        console.error('Error saat login:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
    }
});

app.get('/api/auth/check-token', authorize(), async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    const {
        password,
        tglLahir,
        fotoKtp,
        previlegeStatus,
        ...userData
    } = req.user;
    res.status(200).json({
        accessToken: token,
        user: userData
    });
});

app.get('/api/news', async (req, res) => {
    try {
        const news = await prisma.news.findMany({
            orderBy: {
                tglDibuat: 'desc'
            }
        });
        res.status(200).json(news);
    } catch (error) {
        console.error("Error fetching news:", error);
        res.status(500).json({ message: 'Gagal mengambil data berita.' });
    }
});

app.post('/api/admin/news/submit', authorize(['ADMIN', 'SUPER_ADMIN']), upload.single('imageNews'), async (req, res) => {
    const { description, newsUrl, imageNewsUrl } = req.body;

    if (!req.file) {
        return res.status(400).json({ message: 'Gambar berita wajib diunggah.' });
    }

    try {
        const newNews = await prisma.news.create({
            data: {
                imageNews: req.file.location,
                description,
                newsUrl,
                imageNewsUrl,
            }
        });
        res.status(201).json(newNews);
    } catch (error) {
        console.error("Error creating news:", error);
        res.status(500).json({ message: 'Gagal membuat berita baru.' });
    }
});

app.put('/api/admin/news/update/:id', authorize(['ADMIN', 'SUPER_ADMIN']), upload.single('imageNews'), async (req, res) => {
    const newsId = parseInt(req.params.id);
    const { description, newsUrl, imageNewsUrl } = req.body;

    try {
        const dataToUpdate = {
            description,
            newsUrl,
            imageNewsUrl,
        };

        if (req.file) {
            dataToUpdate.imageNews = req.file.location;
        }

        const updatedNews = await prisma.news.update({
            where: { id: newsId },
            data: dataToUpdate,
        });

        res.status(200).json(updatedNews);
    } catch (error) {
        console.error(`Error updating news ${newsId}:`, error);
        res.status(500).json({ message: 'Gagal memperbarui berita.' });
    }
});




app.get('/api/users/downline/:id', authorize(), async (req, res) => {
    const targetUserId = parseInt(req.params.id);
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.perPage) || 10;
    const skip = (page - 1) * pageSize;

    try {
        const [downlines, totalItems] = await prisma.$transaction([
            prisma.user.findMany({
                where: {
                    uplineId: targetUserId,
                },
                select: {
                    id: true,
                    nama: true,
                    email: true,
                },
                orderBy: {
                    tglDibuat: 'desc',
                },
                skip: skip,
                take: pageSize,
            }),
            prisma.user.count({
                where: {
                    uplineId: targetUserId,
                },
            }),
        ]);

        const totalPages = Math.ceil(totalItems / pageSize);

        res.status(200).json({
            pagination: {
                totalItems,
                totalPages,
                perPage: pageSize,
                currentPage: page,
            },
            data: downlines
        });

    } catch (error) {
        console.error(`Error fetching downlines for user ${targetUserId}:`, error);
        res.status(500).json({ success: false, message: 'Failed to fetch downline data.' });
    }
});

app.get('/api/users/me', authorize(), async (req, res) => {
    const submissionPage = parseInt(req.query.submissionPage) || 1;
    const downlinePage = parseInt(req.query.downlinePage) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true, nama: true, email: true, picture: true, nomorTelepon: true, kecamatan: true,
                domisili: true, balance: true, kodeReferral: true, role: true, previlegeStatus: true,
                bankName: true, noRekening: true,
                upline: { select: { id: true, nama: true, email: true } },
                transactions: { orderBy: { transactionDate: 'desc' }, take: 20 },
                _count: {
                    select: {
                        downlines: true,
                        submissions: true
                    }
                }
            }
        });
        if (!user) return res.status(404).json({ message: 'User tidak ditemukan.' });

        const response = {
            profile: {
                ...user,
                totalDownlines: user._count.downlines,
                totalSubmissions: user._count.submissions
            },
        };
        delete response.profile._count;

        res.json(response);
    } catch (error) {
        console.error('Error get /api/users/me:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
    }
});

app.put('/api/users/me', authorize(), async (req, res) => {
    const userId = req.user.id;
    const { nama, password, nomorTelepon, kecamatan, domisili, tglLahir } = req.body;

    try {
        const dataToUpdate = {};
        if (nama) dataToUpdate.nama = nama;
        if (nomorTelepon) dataToUpdate.nomorTelepon = nomorTelepon;
        if (kecamatan) dataToUpdate.kecamatan = kecamatan;
        if (domisili) dataToUpdate.domisili = domisili;
        if (tglLahir) dataToUpdate.tglLahir = new Date(tglLahir);

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            dataToUpdate.password = hashedPassword;
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: dataToUpdate,
            select: {
                id: true,
                nama: true,
                email: true,
                picture: true,
                nomorTelepon: true,
                kecamatan: true,
                domisili: true,
                tglLahir: true
            }
        });

        res.json(updatedUser);
    } catch (error) {
        console.error(`Error updating profile for user ${userId}:`, error);
        res.status(500).json({ message: 'Gagal memperbarui profil.' });
    }
});

app.put('/api/users/me/picture', authorize(), upload.single('picture'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Tidak ada file gambar yang diunggah.' });
    }
    try {
        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: { picture: req.file.location }
        });
        res.json({ message: 'Foto profil berhasil diperbarui.', pictureUrl: updatedUser.picture });
    } catch (error) {
        console.error('Gagal memperbarui foto profil:', error);
        res.status(500).json({ message: 'Gagal memperbarui foto profil.' });
    }
});

app.get('/api/youtube', async (req, res) => {
    try {
        const youtubeApps = await prisma.youtubeApps.findMany({
            orderBy: {
                tglDibuat: 'desc'
            },
            include: {
                creator: {
                    select: {
                        nama: true
                    }
                }
            }
        });
        res.status(200).json(youtubeApps);
    } catch (error) {
        console.error("Error fetching YoutubeApps:", error);
        res.status(500).json({ message: 'Gagal mengambil data Youtube Apps.' });
    }
});

app.get('/api/admin/history-youtube-apps', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const skip = (page - 1) * pageSize;

    try {
        const [history, totalItems] = await prisma.$transaction([
            prisma.historyYoutubeApps.findMany({
                include: {
                    creator: {
                        select: {
                            nama: true
                        }
                    },
                    YoutubeApps: {
                        select: {
                            urlYoutube: true
                        }
                    }
                },
                orderBy: {
                    tglDibuat: 'desc'
                },
                skip: skip,
                take: pageSize
            }),
            prisma.historyYoutubeApps.count()
        ]);

        res.status(200).json({
            data: history,
            pagination: {
                totalItems,
                totalPages: Math.ceil(totalItems / pageSize),
                currentPage: page,
                pageSize,
            }
        });
    } catch (error) {
        console.error("Error fetching YoutubeApps History:", error);
        res.status(500).json({ message: 'Gagal mengambil riwayat Youtube Apps.' });
    }
});

app.get('/api/youtube-apps', async (req, res) => {
    try {
        const youtubeApps = await prisma.youtubeApps.findMany({
            orderBy: {
                tglDibuat: 'desc'
            },
            include: {
                creator: {
                    select: {
                        nama: true
                    }
                }
            }
        });
        res.status(200).json(youtubeApps);
    } catch (error) {
        console.error("Error fetching YoutubeApps:", error);
        res.status(500).json({ message: 'Gagal mengambil data Youtube Apps.' });
    }
});

app.get('/api/admin/history-youtube-apps', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const skip = (page - 1) * pageSize;

    try {
        const [history, totalItems] = await prisma.$transaction([
            prisma.historyYoutubeApps.findMany({
                include: {
                    creator: {
                        select: {
                            nama: true
                        }
                    },
                    YoutubeApps: {
                        select: {
                            urlYoutube: true
                        }
                    }
                },
                orderBy: {
                    tglDibuat: 'desc'
                },
                skip: skip,
                take: pageSize
            }),
            prisma.historyYoutubeApps.count()
        ]);

        res.status(200).json({
            data: history,
            pagination: {
                totalItems,
                totalPages: Math.ceil(totalItems / pageSize),
                currentPage: page,
                pageSize,
            }
        });
    } catch (error) {
        console.error("Error fetching YoutubeApps History:", error);
        res.status(500).json({ message: 'Gagal mengambil riwayat Youtube Apps.' });
    }
});

app.post('/api/admin/youtube', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
    const { urlYoutube } = req.body;
    const creatorId = req.user.id;

    if (!urlYoutube) {
        return res.status(400).json({ message: 'URL Youtube wajib diisi.' });
    }

    try {
        const newEntry = await prisma.$transaction(async (tx) => {
            const existingEntries = await tx.youtubeApps.findMany();
            if (existingEntries.length > 0) {
                const historyData = existingEntries.map(entry => ({
                    urlYoutube: entry.urlYoutube,
                    youtubeAppsId: entry.id,
                    creatorId: entry.creatorId,
                }));
                await tx.historyYoutubeApps.createMany({
                    data: historyData,
                });
            }
            await tx.youtubeApps.deleteMany({});
            const createdEntry = await tx.youtubeApps.create({
                data: {
                    urlYoutube,
                    creatorId,
                }
            });

            return createdEntry;
        });

        res.status(201).json(newEntry);
    } catch (error) {
        console.error("Error creating new YoutubeApps entry:", error);
        res.status(500).json({ message: 'Gagal membuat entri Youtube Apps baru.' });
    }
});
app.put('/api/admin/youtube/:id', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
    const { id } = req.params;
    const { urlYoutube } = req.body;
    const newCreatorId = req.user.id;

    if (!urlYoutube) {
        return res.status(400).json({ message: 'URL Youtube wajib diisi.' });
    }

    try {
        const updatedEntry = await prisma.$transaction(async (tx) => {
            const entryToUpdate = await tx.youtubeApps.findUnique({
                where: { id: parseInt(id) },
            });

            if (!entryToUpdate) {
                throw new Error('Entri tidak ditemukan.');
            }
            await tx.historyYoutubeApps.create({
                data: {
                    urlYoutube: entryToUpdate.urlYoutube,
                    youtubeAppsId: entryToUpdate.id,
                    creatorId: entryToUpdate.creatorId,
                }
            });
            const updated = await tx.youtubeApps.update({
                where: { id: parseInt(id) },
                data: {
                    urlYoutube,
                    creatorId: newCreatorId,
                }
            });
            return updated;
        });
        res.status(200).json(updatedEntry);
    } catch (error) {
        console.error(`Error updating YoutubeApps entry ${id}:`, error);
        res.status(500).json({ message: error.message || 'Gagal memperbarui entri Youtube Apps.' });
    }
});

app.get('/api/projects', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 5;
    const skip = (page - 1) * pageSize;

    try {
        const [projects, totalItems] = await prisma.$transaction([
            prisma.project.findMany({
                include: {
                    fields: true,
                    creator: { select: { nama: true } },
                },
                skip: skip,
                take: pageSize,
                orderBy: { tglDibuat: 'desc' }
            }),
            prisma.project.count()
        ]);

        res.json({
            pagination: {
                totalItems,
                totalPages: Math.ceil(totalItems / pageSize),
                currentPage: page,
                pageSize,
            },
            data: projects
        });
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
                            value: file.location,
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
        }, { timeout: 30000 }
        );
        res.status(201).json({ message: 'Pengerjaan berhasil dikirim.', submission });
    } catch (error) {
        console.error("Error saat submit pengerjaan:", error);
        res.status(500).json({ message: 'Gagal mengirim pengerjaan.' });
    }
});

app.get('/api/admin/users', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
    const { status } = req.query;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const skip = (page - 1) * pageSize;
    try {
        const whereClause = {};
        if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
            whereClause.statusRegistrasi = status;
        }
        const [users, totalItems] = await prisma.$transaction([
            prisma.user.findMany({
                where: whereClause,
                include: { submissions: { select: { id: true } } },
                orderBy: { tglDibuat: 'desc' },
                skip: skip,
                take: pageSize,
            }),
            prisma.user.count({ where: whereClause })
        ]);
        res.json({
            data: users,
            pagination: {
                totalItems,
                totalPages: Math.ceil(totalItems / pageSize),
                currentPage: page,
                pageSize,
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengambil data pengguna.' });
    }
});
app.put('/api/admin/users/:id', authorize(['ADMIN', 'SUPER_ADMIN']), upload.single('picture'), async (req, res) => {
    const userId = parseInt(req.params.id);
    const { nama, email, role, balance, bankName, noRekening, nomorTelepon } = req.body;
    try {
        const dataToUpdate = {
            nama,
            email,
            role,
            nomorTelepon,
            bankName,
            noRekening,
        };
        if (req.user.role === 'SUPER_ADMIN' && balance !== undefined) {
            dataToUpdate.balance = new Decimal(balance);
        }
        if (req.file) {
            dataToUpdate.picture = req.file.location;
        }
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: dataToUpdate,
        });
        res.json(updatedUser);
    } catch (error) {
        console.error(`Error updating user ${userId}:`, error);
        res.status(500).json({ message: 'Gagal memperbarui data pengguna.' });
    }
});
app.put('/api/admin/users/:id/approve', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
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
app.put('/api/admin/users/:id/reject', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
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
app.post('/api/admin/projects', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
    const { namaProyek, iconUrl, projectUrl, nilaiProyek, deskripsi, category, fields } = req.body;
    const creatorId = req.user.id;
    try {
        if (!namaProyek || !nilaiProyek || !fields || !Array.isArray(fields)) {
            return res.status(400).json({ message: 'Data tidak lengkap.' });
        }
        const newProject = await prisma.project.create({
            data: {
                namaProyek, projectUrl, deskripsi, category,
                nilaiProyek: new Decimal(nilaiProyek),
                creatorId,
                iconUrl: iconUrl || null,
                fields: {
                    create: fields.map(field => ({
                        label: field.label,
                        fieldType: field.fieldType,
                        isRequired: field.isRequired || true,
                    }))
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

app.put('/api/admin/projects/:id', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
    const projectId = parseInt(req.params.id);
    const { namaProyek, iconUrl, nilaiProyek, projectUrl, deskripsi, fields } = req.body;
    try {
        const updatedProject = await prisma.$transaction(async (tx) => {
            await tx.project.update({
                where: { id: projectId },
                data: {
                    namaProyek,
                    nilaiProyek: new Decimal(nilaiProyek),
                    projectUrl,
                    iconUrl: iconUrl || null,
                    deskripsi,
                }
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

app.delete('/api/admin/projects/:id', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
    const projectIdToDelete = parseInt(req.params.id);

    try {
        await prisma.$transaction(async (tx) => {
            const submissionsToDelete = await tx.submission.findMany({
                where: { projectId: projectIdToDelete },
                select: { id: true }
            });
            const submissionIds = submissionsToDelete.map(s => s.id);
            if (submissionIds.length > 0) {
                await tx.submissionValue.deleteMany({
                    where: { submissionId: { in: submissionIds } }
                });
            }
            await tx.submission.deleteMany({
                where: { projectId: projectIdToDelete }
            });
            await tx.projectField.deleteMany({
                where: { projectId: projectIdToDelete }
            });
            await tx.project.delete({
                where: { id: projectIdToDelete }
            });
        });

        res.status(200).json({ message: 'Proyek dan semua data terkait berhasil dihapus.' });

    } catch (error) {
        console.error(`Gagal menghapus proyek: ${projectIdToDelete}`, error);
        if (error.code) {
            return res.status(500).json({ message: `Gagal menghapus proyek karena error database: ${error.code}` });
        }

        res.status(500).json({ message: 'Gagal menghapus proyek.' });
    }
});


app.get('/api/admin/submissions', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
    const { status } = req.query;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const skip = (page - 1) * pageSize;
    try {
        const whereClause = {};
        if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
            whereClause.status = status;
        }
        const [submissions, totalItems] = await prisma.$transaction([
            prisma.submission.findMany({
                where: whereClause,
                include: {
                    user: { select: { nama: true } },
                    project: { select: { namaProyek: true } }
                },
                orderBy: { tglDibuat: 'desc' },
                skip,
                take: pageSize
            }),
            prisma.submission.count({ where: whereClause })
        ]);
        res.json({
            data: submissions,
            pagination: {
                totalItems,
                totalPages: Math.ceil(totalItems / pageSize),
                currentPage: page,
                pageSize,
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Gagal mengambil data submission.' });
    }
});
app.get('/api/users/me/submissions', authorize(), async (req, res) => {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.perPage) || 10;
    const skip = (page - 1) * pageSize;

    try {
        const [submissions, totalItems] = await prisma.$transaction([
            prisma.submission.findMany({
                where: { userId: userId },
                include: {
                    project: {
                        select: {
                            namaProyek: true,
                            nilaiProyek: true,
                            iconUrl: true
                        }
                    },
                    values: {
                        select: {
                            value: true,
                            projectField: {
                                select: {
                                    label: true
                                }
                            }
                        }
                    }
                },
                orderBy: { tglDibuat: 'desc' },
                skip: skip,
                take: pageSize
            }),
            prisma.submission.count({
                where: { userId: userId }
            })
        ]);

        const totalPages = Math.ceil(totalItems / pageSize);

        res.status(200).json({
            pagination: {
                totalItems,
                totalPages,
                currentPage: page,
                pageSize,
            },
            data: submissions
        })

    } catch (error) {
        console.error(`Error fetching submissions for user ${userId}:`, error);
        res.status(500).json({ success: false, message: 'Failed to fetch user report.' });
    }
});

app.get('/api/admin/submissions/:id', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
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

app.put('/api/admin/submissions/:id/approve', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
    const submissionId = parseInt(req.params.id);
    try {
        const submission = await prisma.submission.findUnique({
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

        const operationalUsers = await prisma.user.findMany({
            where: {
                kodeReferral: {
                    in: ['BAXRINO010817', 'BAXFRIANDRE01', 'BAXSULTAN0069', 'BAXWAHYURM069']
                }
            }
        });

        const updatedSubmission = await prisma.$transaction(async (tx) => {
            const { user: pengerja, project } = submission;
            const nilaiProyek = new Decimal(project.nilaiProyek);

            const operations = [];

            operations.push(tx.user.update({
                where: { id: pengerja.id },
                data: { balance: { increment: nilaiProyek } },
            }));
            operations.push(tx.transaction.create({
                data: {
                    tipe: 'PENGERJAAN_PROYEK', jumlah: nilaiProyek,
                    deskripsi: `Bonus pengerjaan proyek: ${project.namaProyek}`,
                    userId: pengerja.id, submissionId: submission.id
                }
            }));

            const uplineL1 = pengerja.upline;
            if (uplineL1) {
                const komisiL1 = nilaiProyek.mul(0.10);
                operations.push(tx.user.update({ where: { id: uplineL1.id }, data: { balance: { increment: komisiL1 } } }));
                operations.push(tx.transaction.create({ data: { tipe: 'KOMISI_UPLINE_1', jumlah: komisiL1, deskripsi: `Komisi dari downline: ${pengerja.nama}`, userId: uplineL1.id, submissionId: submission.id } }));

                const uplineL2 = uplineL1.upline;
                if (uplineL2) {
                    const komisiL2 = nilaiProyek.mul(0.01);
                    operations.push(tx.user.update({ where: { id: uplineL2.id }, data: { balance: { increment: komisiL2 } } }));
                    operations.push(tx.transaction.create({ data: { tipe: 'KOMISI_UPLINE_2', jumlah: komisiL2, deskripsi: `Komisi dari downline level 2: ${pengerja.nama}`, userId: uplineL2.id, submissionId: submission.id } }));
                }
            }

            const bonusMap = {
                'BAXRINO010817': 1100,
                'BAXFRIANDRE01': 1100,
                'BAXSULTAN0069': 400,
                'BAXWAHYURM069': 400
            };
            for (const opUser of operationalUsers) {
                const bonusAmount = new Decimal(bonusMap[opUser.kodeReferral] || 0);
                if (bonusAmount > 0) {
                    operations.push(tx.user.update({ where: { id: opUser.id }, data: { balance: { increment: bonusAmount } } }));
                    operations.push(tx.transaction.create({ data: { tipe: 'BONUS_OPERASIONAL', jumlah: bonusAmount, deskripsi: `Bonus operasional dari submission ID: ${submission.id}`, userId: opUser.id, submissionId: submission.id } }));
                }
            }

            operations.push(tx.submission.update({
                where: { id: submissionId },
                data: { status: 'APPROVED' },
            }));

            await Promise.all(operations);

            return submission;
        }, {
            timeout: 10000,
        });

        res.json({ message: `Submission ID ${submissionId} berhasil disetujui.`, submission: updatedSubmission });
    } catch (error) {
        console.error(`Gagal menyetujui submission ${submissionId}:`, error);
        res.status(500).json({ message: error.message || 'Gagal memproses persetujuan.' });
    }
});


app.put('/api/admin/submissions/:id/reject', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
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

app.post('/api/users/me/withdrawals', authorize(), async (req, res) => {
    const userId = req.user.id;
    const { totalWithdrawal } = req.body;

    if (!totalWithdrawal || totalWithdrawal <= 0) {
        return res.status(400).json({ message: 'Jumlah penarikan tidak valid.' });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            return res.status(404).json({ message: 'User tidak ditemukan.' });
        }

        const requestedAmount = new Decimal(totalWithdrawal);
        if (new Decimal(user.balance).lessThan(requestedAmount)) {
            return res.status(400).json({ message: 'Saldo tidak mencukupi untuk melakukan penarikan.' });
        }

        const newWithdrawal = await prisma.withdrawal.create({
            data: {
                userId: userId,
                totalWithdrawal: requestedAmount,
                status: 'PENDING'
            }
        });

        res.status(201).json({
            message: 'Permintaan penarikan berhasil diajukan dan akan segera diproses.',
            withdrawal: newWithdrawal
        });

    } catch (error) {
        console.error(`Error saat user ${userId} mengajukan penarikan:`, error);
        res.status(500).json({ message: 'Gagal mengajukan permintaan penarikan.' });
    }
});


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
// ROUTES - CONTACT ADMIN
// =============================================

app.get('/api/contact/admin', async (req, res) => {
    try {
        const contact = await prisma.contactAdmin.findFirst({
            orderBy: {
                tglDibuat: 'desc'
            }
        });
        res.status(200).json(contact);
    } catch (error) {
        console.error("Error fetching contact admin:", error);
        res.status(500).json({ message: 'Gagal mengambil data kontak.' });
    }
});

app.get('/api/contact/admin/history', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const skip = (page - 1) * pageSize;

    try {
        const [history, totalItems] = await prisma.$transaction([
            prisma.historyContactAdmin.findMany({
                orderBy: {
                    tglDibuat: 'desc'
                },
                skip,
                take: pageSize
            }),
            prisma.historyContactAdmin.count()
        ]);

        res.status(200).json({
            data: history,
            pagination: {
                totalItems,
                totalPages: Math.ceil(totalItems / pageSize),
                currentPage: page,
                pageSize,
            }
        });
    } catch (error) {
        console.error("Error fetching contact admin history:", error);
        res.status(500).json({ message: 'Gagal mengambil riwayat kontak.' });
    }
});

app.post('/api/contact/admin', authorize(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
    const { phoneNumber } = req.body;
    const creatorId = req.user.id;

    if (!phoneNumber) {
        return res.status(400).json({ message: 'Nomor telepon wajib diisi.' });
    }

    let normalizedPhoneNumber = phoneNumber.toString().trim();

    if (normalizedPhoneNumber.startsWith('+62')) {
        normalizedPhoneNumber = normalizedPhoneNumber.substring(3);
    } else if (normalizedPhoneNumber.startsWith('0')) {
        normalizedPhoneNumber = normalizedPhoneNumber.substring(1);
    }
    try {
        const newContact = await prisma.$transaction(async (tx) => {
            const existingContacts = await tx.contactAdmin.findMany();
            if (existingContacts.length > 0) {
                const historyData = existingContacts.map(contact => ({
                    phoneNumber: contact.phoneNumber.toString(),
                    contactAdminId: contact.id,
                    creatorId: creatorId
                }));
                await tx.historyContactAdmin.createMany({
                    data: historyData,
                });
            }
            await tx.contactAdmin.deleteMany({});

            const createdContact = await tx.contactAdmin.create({
                data: {
                    phoneNumber: normalizedPhoneNumber,
                    creatorId: creatorId,
                }
            });

            return createdContact;
        });

        res.status(201).json(newContact);
    } catch (error) {
        console.error("Error creating new contact admin:", error);
        res.status(500).json({ message: 'Gagal memperbarui kontak admin.' });
    }
});

// ================= TAMBAHAN UNTUK WEB BAXLANCER ====================

app.get('/api/projects/:id', async (req, res) => {
    const projectId = parseInt(req.params.id);
    try {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: {
                fields: true,
            },
        });

        if (!project) {
            return res.status(404).json({ message: 'Proyek tidak ditemukan.' });
        }

        res.json(project);
    } catch (error) {
        console.error(`Error fetching project ${projectId}:`, error);
        res.status(500).json({ message: 'Gagal mengambil data proyek.' });
    }
});

app.get('/api/rino/storage/ke1/file', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const search = req.query.search || '';
    const skip = (page - 1) * pageSize;

    try {
        const whereClause = {
            namaFile: {
                contains: search,
                mode: 'insensitive',
            },
        };

        const [files, totalItems] = await prisma.$transaction([
            prisma.simpanFile.findMany({
                where: whereClause,
                orderBy: { tglDibuat: 'desc' },
                skip: skip,
                take: pageSize,
            }),
            prisma.simpanFile.count({ where: whereClause })
        ]);

        res.status(200).json({
            data: files,
            pagination: {
                totalItems,
                totalPages: Math.ceil(totalItems / pageSize),
                currentPage: page,
                pageSize,
            }
        });
    } catch (error) {
        console.error("Gagal mengambil data file:", error);
        res.status(500).json({ message: 'Gagal mengambil data file.' });
    }
});

app.post('/api/rino/storage/ke1/file', upload.single('berkas'), async (req, res) => {
    // Validasi: Pastikan file berhasil diunggah oleh multer
    if (!req.file) {
        return res.status(400).json({ message: "Tidak ada file yang diunggah." });
    }

    try {
        // Setelah multer selesai, informasi file ada di `req.file`
        // `req.body` masih bisa digunakan jika Anda mengirim field teks lain
        const namaFile = req.file.originalname; // Nama file asli
        const urlFile = req.file.location;      // URL file di S3 dari multer-s3

        const newFile = await prisma.simpanFile.create({
            data: {
                namaFile, // Diambil dari req.file
                urlFile,  // Diambil dari req.file.location
            },
        });
        
        res.status(201).json(newFile);

    } catch (error) {
        console.error("Gagal menyimpan data file:", error);
        res.status(500).json({ message: 'Gagal menyimpan data file baru.' });
    }
});

app.get('/api/news/:id', async (req, res) => {
    const newsId = parseInt(req.params.id);
    try {
        const newsItem = await prisma.news.findUnique({
            where: { id: newsId },
        });

        if (!newsItem) {
            return res.status(404).json({ message: 'Berita tidak ditemukan.' });
        }

        res.json(newsItem);
    } catch (error) {
        console.error(`Error fetching news item ${newsId}:`, error);
        res.status(500).json({ message: 'Gagal mengambil data berita.' });
    }
});

/*
const PORT = process.env.PORT || 6969;
app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
*/
module.exports = app;