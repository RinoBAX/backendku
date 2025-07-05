// api/prisma.js
// File ini membuat satu instance dari PrismaClient agar bisa di-reuse
// di seluruh aplikasi, sesuai dengan best practice.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
