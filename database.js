const { MongoClient } = require('mongodb');

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cdpi8.mongodb.net/EduGrid?retryWrites=true&w=majority`;

let db;

const connectDB = async () => {
    try {
        const client = new MongoClient(uri);
        await client.connect();
        db = client.db('EduGrid');
        console.log('Connected to MongoDB - EduGrid database');
    } catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    }
};

const getDB = () => {
    if (!db) {
        throw new Error('Database not connected');
    }
    return db;
};

module.exports = { connectDB, getDB };
