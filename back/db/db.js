import {Sequelize} from 'sequelize';
import 'dotenv/config.js';

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'postgres',
        logging: false, // Disable logging for cleaner output
    }
)

async function connectDB() {
    try {
        await sequelize.authenticate();
        console.log('Connection has been established successfully.');
    } catch (error) {
        console.error('Unable to connect to the database: ',error);
    }
}

console.log('DB_PASSWORD:', JSON.stringify(process.env.DB_PASSWORD));


export {sequelize,connectDB};