const jwt = require('jsonwebtoken');
const prisma = require('../../db/client.js');
const authorize = (allowedRoles = []) => {
  return async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Akses ditolak. Token tidak ditemukan.' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });
      if (!user) {
        return res.status(403).json({ message: 'Token tidak valid. Pengguna tidak ditemukan.' });
      }
      req.user = user;
      if (allowedRoles.length > 0) {
        if (!allowedRoles.includes(user.role)) {
          return res.status(403).json({ message: 'Akses ditolak. Anda tidak memiliki hak akses yang cukup.' });
        }
      }
      
      next();
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return res.status(403).json({ message: 'Token sudah kedaluwarsa.' });
      }
      return res.status(403).json({ message: 'Token tidak valid.' });
    }
  };
};

module.exports = authorize;
