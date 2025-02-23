#!/bin/bash

# Tạo thư mục ssl nếu chưa tồn tại
mkdir -p ssl

# Tạo private key
openssl genrsa -out ssl/private.key 2048

# Tạo certificate signing request (CSR)
openssl req -new -key ssl/private.key -out ssl/certificate.csr -subj "/C=VN/ST=HoChiMinh/L=HoChiMinh/O=MyOrg/OU=IT/CN=doremonsieucap88.com"

# Tạo self-signed certificate
openssl x509 -req -days 365 -in ssl/certificate.csr -signkey ssl/private.key -out ssl/certificate.crt

# Tạo CA bundle
cat ssl/certificate.crt > ssl/ca_bundle.crt

# Set permissions
chmod 600 ssl/private.key
chmod 644 ssl/certificate.crt ssl/ca_bundle.crt

echo "SSL certificates generated successfully!" 