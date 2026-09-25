const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const checkRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, 
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.userId ? `user:${req.userId}` : `ip:${ipKeyGenerator(req.ip)}`;
  },
  message: { error: 'Too many checks submitted. Please try again later.' },
});

module.exports = { checkRateLimiter };