// api/authMiddleware.js
// Middleware untuk melindungi route dengan memverifikasi JWT (JSON Web Token).

const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  // Mengambil header 'Authorization' dari request.
  const authHeader = req.headers['authorization'];
  
  // Header biasanya dalam format "Bearer TOKEN". Kita ambil token-nya saja.
  const token = authHeader && authHeader.split(' ')[1];

  // Jika tidak ada token, kirim response 401 Unauthorized (Tidak Diizinkan).
  if (token == null) {
    return res.status(401).json({ message: 'Akses ditolak. Token tidak ditemukan.' });
  }

  // Memverifikasi token menggunakan secret key.
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    // Jika token tidak valid (misalnya, sudah expired atau signature salah),
    // kirim response 403 Forbidden (Terlarang).
    if (err) {
      return res.status(403).json({ message: 'Token tidak valid.' });
    }

    // Jika token valid, payload dari token (user) akan disimpan di 'req.user'.
    // Ini memungkinkan route selanjutnya untuk mengakses data user jika diperlukan.
    req.user = user;
    
    // Lanjutkan ke handler/middleware berikutnya.
    next();
  });
};

module.exports = authenticateToken;
