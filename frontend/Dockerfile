FROM node:20-alpine

WORKDIR /app

# Copy package files first — Docker caches this layer.
# npm install only re-runs when package.json/package-lock.json change.
COPY package*.json ./
RUN npm install

# Copy source after deps so code changes don't bust the install cache
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
