# Slate is a single static HTML file — serve it with nginx
FROM nginx:alpine
COPY slate.html /usr/share/nginx/html/index.html
EXPOSE 80
