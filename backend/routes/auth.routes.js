const { Router } = require('express');
const userService = require('../services/user.service');

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const { phone, nickname, password } = req.body;

    if (!phone || !nickname || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const result = await userService.register(phone, nickname, password);
    res.json(result);
  } catch (e) {
    console.error('Register error:', e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const result = await userService.login(phone, password);
    res.json(result);
  } catch (e) {
    console.error('Login error:', e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

module.exports = router;
