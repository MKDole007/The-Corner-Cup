const express = require('express')
const mongoose = require('mongoose')
const path = require('path')
const crypto = require('crypto')
const os = require('os')
const port = process.env.PORT || 3019
const host = '0.0.0.0'
const allowedOrigin = 'https://thecornercup.netlify.app'
const app = express()

app.use(express.static(path.join(__dirname)))
app.use(express.json())
app.use((req, res, next) => {
    const origin = req.headers.origin

    if (origin === allowedOrigin || origin?.startsWith('http://localhost:')) {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Vary', 'Origin')
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    }

    if (req.method === 'OPTIONS') {
        return res.sendStatus(204)
    }

    next()
})

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    orders: { type: Array, default: [] },
    points: { type: Number, default: 0 }
})

const User = mongoose.model('User', userSchema)

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex')
    return `${salt}:${hash}`
}

function passwordMatches(password, storedPassword) {
    const [salt, storedHash] = storedPassword.split(':')
    const hash = crypto.scryptSync(password, salt, 64).toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'))
}

app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email, and password are required.' })
        }

        const normalizedEmail = email.trim().toLowerCase()
        const existingUser = await User.findOne({ email: normalizedEmail })
        if (existingUser) {
            return res.status(409).json({ message: 'Account with this email already exists.' })
        }

        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: hashPassword(password)
        })

        res.status(201).json({ name: user.name, email: user.email, orders: user.orders, points: user.points })
    } catch (error) {
        res.status(500).json({ message: 'Unable to create account.' })
    }
})

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body
        const user = await User.findOne({ email: email?.trim().toLowerCase() })

        if (!user || !passwordMatches(password || '', user.password)) {
            return res.status(401).json({ message: 'Invalid email or password.' })
        }

        res.json({ name: user.name, email: user.email, orders: user.orders, points: user.points })
    } catch (error) {
        res.status(500).json({ message: 'Unable to log in.' })
    }
})

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/login')
    .then(() => console.log('Connected to MongoDB'))
    .catch(error => console.error('MongoDB connection failed:', error.message))

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'))
})

app.listen(port, host, () => {
    console.log(`Server is running at http://localhost:${port}`)

    const networkAddresses = Object.values(os.networkInterfaces())
        .flat()
        .filter(address => address && address.family === 'IPv4' && !address.internal)

    networkAddresses.forEach(address => {
        console.log(`Open on your phone: http://${address.address}:${port}`)
    })
})