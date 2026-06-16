# AWS CloudShell ile S3 ve IAM Kurulum Rehberi (Step-by-Step)

Bu rehber, AWS Management Console üzerindeki **AWS CloudShell**'i (tarayıcı tabanlı terminal) kullanarak S3 bucket oluşturma, izinleri yapılandırma, IAM kullanıcısı tanımlama ve API erişim anahtarları (Access & Secret Key) alma işlemlerini en hızlı ve kolay şekilde yapmanızı sağlar.

---

## Adım 1: AWS CloudShell'i Başlatın
1. AWS Management Console'a giriş yapın.
2. Ekranın sağ üst köşesindeki **CloudShell** simgesine (siyah renkli terminal simgesi `>_`) tıklayın.
3. Terminalin hazır hale gelmesini bekleyin (birkaç saniye sürebilir).

---

## Adım 2: S3 Kova (Bucket) Oluşturma ve Yapılandırma

Aşağıdaki komutları sırasıyla CloudShell terminaline kopyalayıp yapıştırarak çalıştırın:

### 1. Benzersiz bir Kova İsmi Belirleyin
AWS üzerinde S3 kova isimleri tamamen benzersiz olmalıdır. Kendinize bir isim seçin (Örn: `biblecms-media-uploads-12345`):
```bash
BUCKET_NAME="biblecms-media-uploads-12345"
REGION="eu-north-1" # Stockholm bölgesi (Tercihe göre değiştirebilirsiniz)
```

### 2. Kovayı Oluşturun
```bash
aws s3api create-bucket \
  --bucket $BUCKET_NAME \
  --region $REGION \
  --create-bucket-configuration LocationConstraint=$REGION
```

### 3. Public Erişimi Engelleyen Korumaları Kaldırın
Mobil uygulamadan/webden resim ve ses dosyalarına doğrudan erişilebilmesi için kovanın dışarıya açık olması gerekir. Bu korumayı kaldırmak için:
```bash
aws s3api put-public-access-block \
  --bucket $BUCKET_NAME \
  --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"
```

### 4. Herkesin Dosyaları Okuyabilmesi İçin Kova Politikası (Bucket Policy) Ekleyin
Kovaya yüklenen tüm dosyaların dışarıdan okunabilmesi (public read) için şu komut bloğunu yapıştırıp çalıştırın:
```bash
cat <<EOF > policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy \
  --bucket $BUCKET_NAME \
  --policy file://policy.json
```

---

## Adım 3: IAM Kullanıcısı Oluşturma ve İzinleri Tanımlama

Sistemin AWS'ye bağlanıp dosya yükleyebilmesi için bir API kullanıcısı (IAM User) oluşturuyoruz:

### 1. IAM Kullanıcısını Oluşturun
```bash
aws iam create-user --user-name biblecms-s3-uploader
```

### 2. S3 Tam Erişim Yetkisi Atayın
Kullanıcının dosya yükleyebilmesi için S3 yetkisi veriyoruz:
```bash
aws iam attach-user-policy \
  --user-name biblecms-s3-uploader \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
```

### 3. API Erişim Şifrelerini (Access Key & Secret Key) Oluşturun
Panelde kullanacağımız API anahtarlarını üretmek için bu komutu çalıştırın:
```bash
aws iam create-access-key --user-name biblecms-s3-uploader
```

### 4. Çıktıyı Kaydedin!
Yukarıdaki son komut çalıştıktan sonra ekrana şunun gibi bir çıktı gelecektir:
```json
{
    "AccessKey": {
        "UserName": "biblecms-s3-uploader",
        "AccessKeyId": "AKIAIOSFODNN7EXAMPLE",
        "Status": "Active",
        "SecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        "CreateDate": "2026-06-16T19:18:23Z"
    }
}
```
* **AccessKeyId**: Sizin **AWS Access Key ID** değerinizdir.
* **SecretAccessKey**: Sizin **AWS Secret Access Key** değerinizdir.
* Bu değerleri güvenli bir yere kopyalayın.

---

## Adım 4: BibleCMS Panelinde Kullanma
1. **BibleCMS Admin Paneli**'ne girin.
2. Sol menüdeki **AWS Upload Panel** sekmesine gidin.
3. Ayarlar alanına CloudShell'den aldığınız bilgileri girin:
   - **AWS S3 Bucket:** Kova adınız (Örn: `biblecms-media-uploads-12345`)
   - **AWS Access Key ID:** Çıktıdaki `AccessKeyId`
   - **AWS Secret Access Key:** Çıktıdaki `SecretAccessKey`
   - **AWS Region:** Seçtiğiniz bölge kodu (Örn: `eu-north-1`)
4. Sağ taraftaki formdan dosyayı seçip **Upload to AWS** butonuna tıklayın. Yükleme tamamlandığında size kopyalamanız için bir S3 URL'si verecektir.

---
*Not: Bilgileri kalıcı olarak sunucuya kaydetmek isterseniz, projenin kök dizinindeki `.env` dosyasına şu şekilde ekleyebilirsiniz:*
```env
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=eu-north-1
AWS_S3_BUCKET=biblecms-media-uploads-12345
```
