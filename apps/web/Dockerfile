FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL

COPY package.json ./
COPY .npmrc ./
RUN npm install && rm -f .npmrc

COPY index.html ./
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine AS runtime
WORKDIR /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist ./

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
