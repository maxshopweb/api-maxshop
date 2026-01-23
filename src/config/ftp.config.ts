import dotenv from 'dotenv';

dotenv.config();

export interface FTPConfig {
  host: string;
  user: string;
  password: string;
  port: number;
  secure: boolean;
  remotePath: string;
}

export const ftpConfig: FTPConfig = {
  host: process.env.FTP_HOST || '',
  user: process.env.FTP_USER || '',
  password: process.env.FTP_PASSWORD || '',
  port: parseInt(process.env.FTP_PORT || '21', 10),
  secure: false, // FTP estándar, no SFTP
  remotePath: '/Tekno/Bases', // Ruta en el servidor FTP
};

// Validar que las credenciales estén configuradas
if (!ftpConfig.host || !ftpConfig.user || !ftpConfig.password) {
  console.warn('⚠️  Advertencia: Credenciales FTP no configuradas completamente en .env');
}
