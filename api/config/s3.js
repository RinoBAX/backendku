const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');

const s3Client = new S3Client({
    endpoint: process.env.S3_ENDPOINT, 
    region: "idn",
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    }
});

const upload = multer({
    storage: multerS3({
        s3: s3Client,
        bucket: process.env.S3_BUCKET_NAME,
        acl: 'public-read',
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, 'uploads/' + file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
        }
    })
});

module.exports = { upload };
