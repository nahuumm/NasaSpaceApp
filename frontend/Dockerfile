# frontend/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copiamos primero los archivos de dependencias
COPY package*.json ./

# Instalamos los paquetes de Next.js/React
RUN npm install

# Copiamos el resto del código del frontend
COPY . .

EXPOSE 3000

# Comando para iniciar el servidor de desarrollo
CMD ["npm", "run", "dev"]