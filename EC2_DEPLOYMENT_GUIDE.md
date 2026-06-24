# AWS EC2 Konsol Ekranı Doldurma ve Canlıya Alma Rehberi

AWS Management Console üzerinde **Launch an instance** (Örnek Başlat) ekranında doldurmanız gereken tüm input alanlarının değerleri ve kurulum adımları aşağıdadır.

---

## Part 1: AWS EC2 Konsolunda Doldurulacak Alanlar

EC2 kurulum ekranındaki ilgili alanları aşağıdaki gibi doldurun:

1. **Name and tags (Ad ve etiketler):**
   * **Name:** `KidBibleService`

2. **Application and OS Images (Uygulama ve İşletim Sistemi İmajları - AMI):**
   * **Quick Start (Hızlı Başlangıç):** `Amazon Linux` butonunu seçin.
   * **Amazon Machine Image (AMI):** `Amazon Linux 2023 AMI` (Seçili gelen varsayılan sürüm).
   * **Architecture (Mimari):** `64-bit (x86)` (Varsayılan).

3. **Instance type (Örnek tipi):**
   * **Instance type:** `t3.micro` (Family: t3, 2 vCPU, 1 GiB Memory).

4. **Key pair (Anahtar çifti):**
   * **Key pair name:** **Create new key pair** (Yeni anahtar çifti oluştur) butonuna tıklayın:
     * **Key pair name:** `KidBibleServiceKey`
     * **Key pair type:** `RSA`
     * **Private key file format:** `.pem` (Mac/Linux için OpenSSH ile kullanım veya Windows 10/11) veya `.ppk` (Eski Windows Putty için).
     * **Create key pair** butonuna basıp dosyayı bilgisayarınıza indirin.

5. **Network settings (Ağ ayarları):**
   * **VPC / Subnet:** Varsayılan (Default) ayarlar.
   * **Auto-assign public IP (Genel IP'yi otomatik ata):** `Enable` (Etkinleştir).
   * **Firewall (Güvenlik Grupları):** **Create security group** (Güvenlik grubu oluştur) seçin.
   * **Security group name:** `launch-wizard-1` (Veya varsayılan bırakın).
   * **İzin Verilecek Trafik Seçenekleri (Alt alta 3 kutucuğu da işaretleyin):**
     * [x] **Allow SSH traffic from Anywhere (0.0.0.0/0)** (Her yerden SSH trafiğine izin ver)
     * [x] **Allow HTTPS traffic from the internet (0.0.0.0/0)** (İnternetten HTTPS trafiğine izin ver)
     * [x] **Allow HTTP traffic from the internet (0.0.0.0/0)** (İnternetten HTTP trafiğine izin ver)

6. **Configure storage (Depolamayı yapılandır):**
   * **Boyut:** `8 GiB`
   * **Tip:** `gp3` (EBS Root volume, Not encrypted).

7. **Advanced details (Gelişmiş detaylar):**
   * Herhangi bir değişiklik yapmanıza gerek yoktur, varsayılan bırakın.

*Sağ taraftaki panelden **Launch Instance** (Örneği başlat) butonuna tıklayarak sunucunuzu oluşturun.*

---

## Part 2: Sunucu Kurulum ve Canlıya Alma Adımları

Sunucu çalışır duruma geldikten sonra, SSH ile bağlanarak aşağıdaki komutlarla kurulumu tamamlayın.

### Adım 1: EC2 Sunucusuna SSH ile Bağlanma
Lokal terminalinizde (indirdiğiniz `KidBibleServiceKey.pem` dosyasının olduğu klasörde) çalıştırın:
```bash
# Anahtar yetkilerini kısıtlayın
chmod 400 KidBibleServiceKey.pem

# SSH ile bağlanın
ssh -i "KidBibleServiceKey.pem" ec2-user@<SUNUCU_PUBLIC_IP_ADRESI>
```

### Adım 2: Node.js, Git ve Nginx Kurulumu
```bash
# Sistem güncellemeleri
sudo dnf update -y

# Git
sudo dnf install git -y

# Node.js 20 LTS
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Nginx
sudo dnf install nginx -y
```

### Adım 3: Proje Kodlarını Çekme
```bash
sudo mkdir -p /var/www/KidBibleService
sudo chown -R ec2-user:ec2-user /var/www/KidBibleService
cd /var/www/KidBibleService

# Kendi GitHub reposunuza göre güncelleyin:
git clone <REPO_URL> .
npm install --production
```

### Adım 4: `.env` Dosyası Oluşturma
```bash
nano .env
```
İçeriği aşağıdaki gibi doldurun (`Ctrl+O` -> `Enter` kaydedip, `Ctrl+X` çıkın):
```env
PORT=3000
NODE_ENV=production
JWT_SECRET=production_jwt_gizli_anahtari_buraya_yazilacak

# AWS S3. Production'da EC2 IAM Role kullanın; static access key yazmayın.
AWS_REGION=eu-north-1
AWS_S3_BUCKET=biblecms
AWS_S3_PREFIX=kidsbible-content
```

### Adım 5: PM2 (Arka Planda Çalıştırma)
```bash
sudo npm install -g pm2
pm2 start index.js --name "KidBibleService"
pm2 startup
# (Ekrana gelen komutu kopyalayıp sudo olarak çalıştırın)
pm2 save
```

### Adım 6: Nginx Reverse Proxy (3000 Port Yönlendirmesi)
```bash
sudo nano /etc/nginx/nginx.conf
```
`server { listen 80 ... }` bloğunun altındaki `location /` kısmını şu şekilde değiştirin:
```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```
Ayarları test edip Nginx'i başlatın:
```bash
sudo nginx -t
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Adım 7: Ücretsiz SSL (HTTPS) Kurulumu
```bash
sudo dnf install -y augeas-libs
sudo python3 -m venv /opt/certbot/
sudo /opt/certbot/bin/pip install --upgrade pip
sudo /opt/certbot/bin/pip install certbot certbot-nginx
sudo ln -s /opt/certbot/bin/certbot /usr/bin/certbot

# Domain adresinize göre sertifikayı oluşturun (örn: admin.kidbible.com)
sudo certbot --nginx -d admin.kidbible.com
```
