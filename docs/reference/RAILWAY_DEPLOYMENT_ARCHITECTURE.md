# Railway Deployment Mimarisi — Detaylı Rehber

**Amaç:** Bu proje Railway'e (GitHub üzerinden) nasıl deploy ediliyor — Docker stratejisi, çoklu ortam, çoklu Dockerfile ve **monorepo sorununun çözümü** dahil. Bu doküman, başka bir geliştiriciye/agent'a **aynı desende yeni bir uygulamayı Railway'e deploy ettirmek** için referans olacak şekilde yazılmıştır.

**Hazırlanma tarihi:** 2026-07-14
**Kaynak doğrulaması:** Gerçek dosyalar (Dockerfile'lar, `railway.json`'lar, `.env.railway.*`, `Program.cs`, GitHub Actions) okunarak hazırlanmıştır; her iddia dosya referanslıdır.

> 🔴 **ÖNCE GÜVENLİK UYARISI (Bölüm 12'de detay):** Bu repoda `.env.railway.*` dosyaları ve [docs/CI-CD-DEPLOYMENT-GUIDE.md](../docs/CI-CD-DEPLOYMENT-GUIDE.md) **git'e commit edilmiş** ve **gerçek production/staging şifreleri** (PostgreSQL, Redis, RabbitMQ, JWT) içeriyor. Yeni uygulamada bu deseni **tekrarlama**; sırları yalnızca Railway dashboard'a gir. Mevcut sırlar rotate edilmeli.

---

## 1. Genel Bakış — Ne Deploy Ediliyor?

İki ayrı git reposu, tek Railway projesi (veya ortam başına proje) altında birden çok servis olarak deploy edilir:

| Servis | Teknoloji | Repo | Rol |
|--------|-----------|------|-----|
| **WebAPI** | .NET 9 | `ziraaiv1` (monorepo) | REST API |
| **PlantAnalysisWorkerService** | .NET 9 | `ziraaiv1` (monorepo) | Sonuç tüketici + DB yazımı + Hangfire |
| **analysis-worker** | Node/TS 18 | `ziraai-workers` (ayrı repo) | AI provider worker'ı (provider başına replica) |
| **dispatcher** | Node/TS | `ziraai-workers` | Provider yönlendirici |

Paylaşılan altyapı (bir kez provision, tüm servisler referans eder): **PostgreSQL**, **Redis**, **RabbitMQ/CloudAMQP**.

**Platform seçimleri (tümü Railway):**
- Build: **Docker** (Dockerfile builder) — Nixpacks değil (bir istisna hariç, bkz. Bölüm 6).
- Deploy: **GitHub push → otomatik build & deploy** (branch bazlı).
- Health: `/health` (yalnızca .NET servisleri), restart policy `ON_FAILURE`.

---

## 2. ⭐ Monorepo Sorunu ve Çözümü

Bu, projenin en kritik ve en çok tökezlenen deployment problemidir. **İki ayrı monorepo durumu** vardır ve **iki farklı çözüm** kullanılır.

### 2.1 Sorun: .NET paylaşımlı-proje monorepo'su

`ziraaiv1` reposu tek bir git reposunda **6 proje** barındırır ve bunlardan ikisi deploy edilebilir servistir:

```
ziraaiv1/                       # tek repo
├── WebAPI/                     # deploy edilir (servis 1)
├── PlantAnalysisWorkerService/ # deploy edilir (servis 2)
├── Business/    ┐
├── DataAccess/  │  paylaşılan kütüphaneler
├── Entities/    │  (her iki servis de bunlara bağımlı)
└── Core/        ┘
```

**Problem:** WebAPI'yi build etmek için Docker'ın `Business/`, `DataAccess/`, `Entities/`, `Core/` projelerine de erişmesi gerekir. Eğer Docker build context'i `WebAPI/` klasörüne ayarlanırsa, `COPY ["Core/Core.csproj", ...]` **başarısız olur** → klasik hata:

```
ERROR: "/Core/Core.csproj": not found
```
(Kaynak: [docs/RAILWAY_DEPLOYMENT.md](../docs/RAILWAY_DEPLOYMENT.md) §Troubleshooting #1, [docs/RAILWAY_DOCKER_FIX.md](../docs/RAILWAY_DOCKER_FIX.md))

### 2.2 Çözüm (kanonik, çalışan): "Root Directory boş + RAILWAY_DOCKERFILE_PATH"

Prensip: **Build context = repo kökü** olacak, ve her servis **hangi Dockerfile'ı kullanacağını bir env değişkeniyle** seçecek.

**Adımlar (her .NET servisi için Railway dashboard'da):**
1. **Settings → Root Directory: BOŞ bırak** (repo kökü build context olur — paylaşılan projelere erişim böyle sağlanır).
2. **Variables → `RAILWAY_DOCKERFILE_PATH` ekle:**
   - WebAPI servisi: `RAILWAY_DOCKERFILE_PATH=Dockerfile.webapi`
   - Worker servisi: `RAILWAY_DOCKERFILE_PATH=Dockerfile.worker`
3. Dockerfile'lar **repo kökünde** durur ve paylaşılan `.csproj`'leri kök-göreli yollarla kopyalar.

Bu yüzden kök Dockerfile'lar şu deseni kullanır ([Dockerfile.webapi:13-24](../Dockerfile.webapi#L13-L24)):

```dockerfile
# Önce SADECE .csproj dosyaları kopyalanır (Docker layer cache için)
COPY ["WebAPI/WebAPI.csproj", "WebAPI/"]
COPY ["Business/Business.csproj", "Business/"]
COPY ["DataAccess/DataAccess.csproj", "DataAccess/"]
COPY ["Entities/Entities.csproj", "Entities/"]
COPY ["Core/Core.csproj", "Core/"]
RUN dotnet restore "WebAPI/WebAPI.csproj"   # restore layer'ı cache'lenir
# SONRA tüm kaynak kopyalanır
COPY . .
```

> **Neden bu desen?** Önce sadece `.csproj`'leri kopyalayıp `restore` çalıştırmak, kaynak kod değiştiğinde NuGet restore layer'ının cache'ten gelmesini sağlar (hızlı rebuild). `COPY . .` ile tüm kaynağı kopyalamak ise build context'in repo kökü olmasını **zorunlu** kılar → bu yüzden Root Directory boş olmalı.

**Servis ayrımını sağlayan tek fark:** hangi projenin publish edildiği. `Dockerfile.webapi` → `WebAPI.dll`, `Dockerfile.worker` → `PlantAnalysisWorkerService.dll`. Aynı build context, farklı Dockerfile.

### 2.3 Sorun 2: Node çoklu-servis reposu

`ziraai-workers` reposu ayrı bir repodur ve içinde birden çok servis alt-klasör olarak durur:

```
ziraai-workers/
├── analysis-worker/   # deploy edilir (servis)
│   ├── Dockerfile
│   └── src/
└── dispatcher/        # deploy edilir (servis)
    ├── Dockerfile
    └── src/
```

**Çözüm:** Node servisleri paylaşılan üst-proje bağımlılığına sahip olmadığından, her servis için **Railway "Root Directory" = alt-klasör** ayarlanır (ör. `workers/analysis-worker`), böylece build context o alt-klasör olur ve Dockerfile basit göreli `COPY package*.json ./` kullanır ([analysis-worker/Dockerfile:11-12](../workers/analysis-worker/Dockerfile#L11-L12)).

> ⚠️ Dokümanlarda bir tutarsızlık var: [RAILWAY_STAGING_DEPLOYMENT.md](../workers/claudedocs/PlatformModernization/RAILWAY_STAGING_DEPLOYMENT.md) bir yerde Root Directory `/`, başka yerde `workers/analysis-worker` diyor. `workers/analysis-worker/railway.json` içinde `dockerfilePath` **yok** — yani Dockerfile yolu/root dizini **Railway UI'dan** ayarlanmalı. Yeni bir Node worker için en temizi: Root Directory = servisin alt-klasörü.

### 2.4 ⚠️ Dikkat: Repoda 3 rakip monorepo stratejisi birikmiş (evrim)

Zaman içinde farklı yaklaşımlar denenmiş; hepsi hâlâ dosyalarda duruyor. Yeni uygulamada **birini seç, karıştırma**:

| Yaklaşım | Nasıl | Durum |
|----------|-------|-------|
| **A (kanonik/çalışan)** | Root Directory boş + `RAILWAY_DOCKERFILE_PATH=Dockerfile.webapi` + kök Dockerfile'lar (`COPY ["WebAPI/..."]`) | ✅ Kök Dockerfile'ların COPY yollarıyla **uyumlu**; önerilen |
| **B (docs/CI-CD-DEPLOYMENT-GUIDE.md, Eyl 2025)** | Root Directory `/WebAPI` + `dockerfilePath: WebAPI.Dockerfile` (benzersiz isim, Railway auto-detect çakışmasını önlemek için) | ⚠️ `WebAPI/WebAPI.Dockerfile` dosyası **var** ama Root Directory `/WebAPI` olursa build context alt-klasör olur ve paylaşılan projelere erişemez — kök Dockerfile'ların COPY deseniyle çelişir. Dikkatli kullan. |
| **C (railway.production.json)** | NIXPACKS + `buildCommand: dotnet publish ...` | ⚠️ Diğer tüm config DOCKERFILE derken bu NIXPACKS; tutarsız. |

**Öneri:** Yeni .NET monorepo servisi için **Yaklaşım A**. Sadeliği ve mevcut kök Dockerfile'larla uyumu nedeniyle en güvenli olan bu.

---

## 3. ⭐ Çoklu Dockerfile Stratejisi

Repoda çok sayıda Dockerfile var. İşte envanter ve her birinin rolü:

### 3.1 Dockerfile envanteri

| Dockerfile | Servis | Ortam | Yaklaşım | Not |
|------------|--------|-------|----------|-----|
| `Dockerfile` (kök) | WebAPI | çoklu (ARG) | `TARGET_ENVIRONMENT` build-arg | Kök `railway.json`'un işaret ettiği |
| `Dockerfile.webapi` | WebAPI | çoklu (ARG) | `RAILWAY_DOCKERFILE_PATH` hedefi | **Aktif WebAPI** (Yaklaşım A) |
| `Dockerfile.worker` | WorkerService | çoklu (ARG) | `RAILWAY_DOCKERFILE_PATH` hedefi | **Aktif Worker** (Yaklaşım A) |
| `Dockerfile.staging` | WebAPI | Staging (sabit) | ortam-gömülü | Alternatif; ENV'ler hardcoded |
| `Dockerfile.production` | WebAPI | Production (sabit) | ortam-gömülü | Non-root user, ReadyToRun, S3, EXPOSE 8443 |
| `Dockerfile.netfix` | WebAPI | — | "minimal working" | Fallback/deneme |
| `Dockerfile.test` | — | test | — | Test |
| `WebAPI/WebAPI.Dockerfile` | WebAPI | çoklu | Yaklaşım B | Alt-klasör varyantı |
| `PlantAnalysisWorkerService/PlantAnalysisWorkerService.Dockerfile` | Worker | çoklu | Yaklaşım B | Alt-klasör varyantı |
| `workers/analysis-worker/Dockerfile` | analysis-worker | çoklu (ENV) | Node multi-stage | Aktif |
| `workers/dispatcher/Dockerfile` | dispatcher | çoklu (ENV) | Node multi-stage | Aktif |

> **Dürüst değerlendirme:** Bu bir "Dockerfile zoo"su — teknik borç. `Dockerfile` ≈ `Dockerfile.webapi` neredeyse birebir aynı. Yeni bir projede **servis başına tek Dockerfile** yeterlidir. Aşağıdaki desenleri anlamak, hangisini kullanacağını seçmen için verilmiştir.

### 3.2 .NET Dockerfile deseni (4 aşamalı multi-stage)

Tüm .NET Dockerfile'lar aynı iskeleti kullanır ([Dockerfile.webapi](../Dockerfile.webapi)):

```dockerfile
ARG TARGET_ENVIRONMENT=Staging          # ← çoklu ortam anahtarı
ARG BUILD_CONFIGURATION=Release

# 1) base: sadece runtime image
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS base
WORKDIR /app

# 2) build: SDK ile derleme (selective csproj COPY + restore + COPY . . + build)
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
...

# 3) publish: yayınlanabilir çıktı
FROM build AS publish
RUN dotnet publish "WebAPI.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

# 4) final: base + publish çıktısı (küçük runtime image)
FROM base AS final
COPY --from=publish /app/publish .
```

**Neden multi-stage?** Son image yalnızca `aspnet` runtime + publish çıktısını içerir; ağır SDK ve ara build artefaktları image'a girmez → küçük, güvenli production image.

### 3.3 Çoklu ortam — TEK Dockerfile ile (build-arg deseni)

`Dockerfile`, `Dockerfile.webapi`, `Dockerfile.worker` **tek dosyayla tüm ortamları** karşılar. Sır: build sırasında `TARGET_ENVIRONMENT` arg'ına göre doğru `appsettings.{Env}.json` alınıp `appsettings.json` olarak yeniden adlandırılır ([Dockerfile.webapi:47-61](../Dockerfile.webapi#L47-L61)):

```dockerfile
# Tüm appsettings dosyalarını /app/config'e koy
COPY --from=build /src/WebAPI/appsettings*.json /app/config/

# TARGET_ENVIRONMENT'a göre doğru olanı appsettings.json yap
RUN if [ "$TARGET_ENVIRONMENT" = "Staging" ] && [ -f /app/config/appsettings.Staging.json ]; then \
        cp /app/config/appsettings.Staging.json /app/appsettings.json; \
    elif [ "$TARGET_ENVIRONMENT" = "Production" ] && [ -f /app/config/appsettings.Production.json ]; then \
        cp /app/config/appsettings.Production.json /app/appsettings.json; \
    fi
...
ENV ASPNETCORE_ENVIRONMENT=$TARGET_ENVIRONMENT
```

Railway'de ortam farkı, ya `--build-arg TARGET_ENVIRONMENT=Production` ile ya da (daha yaygın) `ASPNETCORE_ENVIRONMENT` env + Railway env değişkenleriyle sağlanır. Not: Runtime'da .NET zaten `appsettings.{ASPNETCORE_ENVIRONMENT}.json`'ı otomatik yükler; bu Dockerfile hilesi bir yedek/garanti mekanizmasıdır.

### 3.4 Çoklu ortam — AYRI Dockerfile ile (alternatif desen)

`Dockerfile.staging` ve `Dockerfile.production` alternatif bir yaklaşımdır: her ortam kendi Dockerfile'ında **gömülü ENV varsayılanlarıyla** gelir. Farklar:

| Ayar | Dockerfile.staging | Dockerfile.production |
|------|--------------------|-----------------------|
| Log seviyesi | `Information`/`Warning` | `Warning`/`Error` (az verbose) |
| FileStorage | `FreeImageHost` | `S3` |
| Hangfire | `false` | `true` |
| RabbitMQ | `false` | `true` |
| Elasticsearch | `false` | `true` |
| Güvenlik | — | **non-root user** (`ziraai`), ReadyToRun, EXPOSE 8443, ForwardedHeaders |
| appsettings | 4 dosyayı da kopyalar | sadece base + Production |

> **Ne zaman hangisi?** Tek-Dockerfile+ARG (3.3) DRY'dır ama build-arg yönetimi gerekir. Ayrı-Dockerfile (3.4) daha açık ama kod tekrarı yüksek. Bu repo ikisini de barındırıyor (teknik borç). **Öneri:** yeni projede tek-Dockerfile+ARG deseni + Railway env override.

### 3.5 Node (TypeScript) Dockerfile deseni

Node worker'lar 2 aşamalı, güvenlik odaklı ([analysis-worker/Dockerfile](../workers/analysis-worker/Dockerfile)):

```dockerfile
# Stage 1: build (tüm bağımlılıklar + tsc derleme)
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci                    # devDependencies dahil (build için)
COPY src ./src
RUN npm run build             # tsc → dist/

# Stage 2: production (sadece prod bağımlılıkları + dist)
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
# Güvenlik: non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 && chown -R nodejs:nodejs /app
USER nodejs
HEALTHCHECK ... CMD node -e "console.log('healthy')" || exit 1
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

Öne çıkanlar: **alpine** (küçük image), **`npm ci --omit=dev`** (production'da devDeps yok), **non-root user** (güvenlik), Node 18 (worker) / Node 20 (dispatcher — sürüm tutarsızlığı, önemsiz).

### 3.6 `.dockerignore` rolü

Kök [.dockerignore](../.dockerignore) `**/Dockerfile*`, `**/bin`, `**/obj`, `**/node_modules`, `**/.git`, `**/.env`'i hariç tutar → build context küçülür, sırlar/artefaktlar image'a sızmaz. Node tarafında [analysis-worker/.dockerignore](../workers/analysis-worker/.dockerignore) `node_modules`, `dist`, `.env*` (ama `!.env.example`), test ve doküman dosyalarını hariç tutar.

---

## 4. ⭐ Çoklu Ortam Stratejisi (3 Katmanlı Config)

Ortam-özel değerler **üç katmandan** gelir; sonraki öncekini ezer:

```
1) appsettings.{Environment}.json   (build'e gömülü, en düşük öncelik)
        ▼ ezilir
2) Dockerfile ENV varsayılanları    (ör. ENV UseRedis=true — "cloud override edecek")
        ▼ ezilir
3) Railway Environment Variables    (dashboard, EN YÜKSEK öncelik)
```

### 4.1 Branch → Ortam eşlemesi

| Branch | Ortam | Auto-deploy |
|--------|-------|-------------|
| `master` | Production | Railway'de ayarlanır (bir config `false`, biri `true` — tutarsız; dashboard'da netleştir) |
| `staging` | Staging | `true` (PR deploy dahil) |

Kaynak: [railway.staging.json](../railway.staging.json), [railway.production.json](../railway.production.json). GitHub Actions ([.github/workflows/railway-deploy.yml](../.github/workflows/railway-deploy.yml)) `master`/PR'da build+test çalıştırır, sonra Railway auto-deploy devreye girer.

### 4.2 .NET config binding: nasıl çalışır (kritik)

**Double-underscore (`__`) kuralı:** ASP.NET Core `AddEnvironmentVariables()` `__`'yi config hiyerarşi ayıracı `:`'ye çevirir. Örnekler:

| Env değişkeni | Bind edilen config | Nerede okunur |
|---------------|--------------------|---------------|
| `ConnectionStrings__DArchPgContext` | `ConnectionStrings:DArchPgContext` | EF `ProjectDbContext`, `AutofacBusinessModule` |
| `RabbitMQ__ConnectionString` | `RabbitMQOptions` (SectionName="RabbitMQ") | worker `Program.cs` |
| `CacheOptions__Host/Port/Password/Ssl` | `CacheOptions` | Redis + SignalR backplane |
| `TokenOptions__SecurityKey/Issuer` | JWT `TokenOptions` | Auth |

> ⚠️ **Tek underscore ÇALIŞMAZ**, isimler **case-sensitive**. Nested: `Logging__LogLevel__Microsoft__AspNetCore` → `Logging:LogLevel:Microsoft.AspNetCore`.

**Öncelik sırası:** `Program.cs`'te JSON **önce**, `AddEnvironmentVariables()` **en son** yüklenir → Railway env değişkenleri JSON'u ezer. (Bu yüzden `appsettings.Staging.json`'ı değiştirmek bir env değişkeni tarafından ezildiğinde etkisiz kalır — gerçek bir bug kaynağı, [RAILWAY_ENVIRONMENT_FIX.md](../claudedocs/issue/RAILWAY_ENVIRONMENT_FIX.md).)

**Railway `DATABASE_URL` dönüşümü:** Railway PostgreSQL `DATABASE_URL`'i `postgresql://user:pass@host:port/db` formatında verir; .NET ise `Host=...;Port=...;SSL Mode=Require` ister. [RailwayConfigurationHelper.cs](../Core/Utilities/Helpers/RailwayConfigurationHelper.cs) bu dönüşümü ve öncelik sırasını (`DATABASE_CONNECTION_STRING` → `DATABASE_URL` → `PGHOST/PGPORT/...`) yapar.

> ⚠️ **İki .NET servisi arasında asimetri (önemli):**
> - **WebAPI**, `RailwayConfigurationHelper`'ı **çağırmaz**; sadece `DATABASE_CONNECTION_STRING`'i `ConnectionStrings__DArchPgContext`'e kopyalar. Yani WebAPI'nin **doğru formatlı `ConnectionStrings__DArchPgContext`** değişkenine ihtiyacı vardır; ham `DATABASE_URL`'i dönüştürmez.
> - **PlantAnalysisWorkerService**, `RailwayConfigurationHelper.GetDatabaseConnectionString()`'i **çağırır**; `DATABASE_URL`/`PG*` fallback'lerini tam destekler.
> Yeni servis tasarlarken bu farkı bil: WebAPI için connection string'i .NET formatında hazır ver.

### 4.3 Servis feature toggle'ları (ortama göre)

Dockerfile ENV varsayılanları + Railway override ile servisler açılıp kapanır:

| Flag | WebAPI | Worker | Amaç |
|------|--------|--------|------|
| `UseHangfire` | `false` | `true` | Worker background job'ları çalıştırır |
| `UseRabbitMQ` | staging `false` / prod `true` | `true` | Mesaj kuyruğu |
| `UseRedis` | `true` | `true` | Cache + SignalR backplane |
| `UseElasticsearch` | `false` | `false` | Arama (devre dışı) |
| `TaskScheduler__UseTaskScheduler` | `false` | `true` | Zamanlanmış işler |
| `FileStorage__Provider` | `FreeImageHost`/`S3` | — | Görsel depolama |

> **Kritik kural:** Provision etmediğin bir servisi flag'le **kapat**, yoksa startup hata verir/asılır. Örn. RabbitMQ yoksa `UseRabbitMQ=false`.

### 4.4 Private vs Public networking (`.internal.all` vs `.all`)

Repodaki `.env.railway.*` dosyaları iki bağlantı profili sunar:

| Profil | Dosyalar | Host örneği | Port | SSL |
|--------|----------|-------------|------|-----|
| **Public proxy** | `*.all` | `yamabiko.proxy.rlwy.net:41760` | rastgele yüksek | `true` |
| **Private network** | `*.internal.all` | `postgres.railway.internal:5432` | standart | `false` |

**Öneri (production):** `*.internal.all` profili — Railway özel IPv6 ağı, düşük gecikme, DB/Redis/RabbitMQ dışarı açık değil. Public proxy yalnızca proje-dışı erişim gerektiğinde. (Referans: [RAILWAY_ENVIRONMENT_VARIABLES_CHECKLIST.md](../claudedocs/RAILWAY_ENVIRONMENT_VARIABLES_CHECKLIST.md) §Private Networking.)

---

## 5. railway.json Anatomisi ve Varyantları

`railway.json` (servis başına veya kökte) Railway'e build+deploy talimatı verir. Aktif .NET servis şablonu ([WebAPI/railway.json](../WebAPI/railway.json)):

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build":  { "builder": "DOCKERFILE" },
  "deploy": {
    "startCommand": "dotnet WebAPI.dll",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

Node worker şablonu ([analysis-worker/railway.json](../workers/analysis-worker/railway.json)) — health yok (background consumer):

```json
{
  "build":  { "builder": "DOCKERFILE" },
  "deploy": {
    "startCommand": "node dist/index.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

Varyantlar ve **tutarsızlıklar** (dürüstçe):
- `railway.json` (kök): her iki ortam için `DOCKERFILE`.
- `railway.staging.json`: `branch: staging`, `autoDeployEnabled: true`, `DOCKERFILE`.
- `railway.production.json`: `branch: master`, `autoDeployEnabled: false`, **`NIXPACKS`** + `buildCommand` — diğerleriyle çelişir.
- CI-CD guide (Yaklaşım B): `dockerfilePath` + `watchPaths` + `environments.{staging,production}.variables` kullanır.

> Gerçekte Railway davranışı **dashboard ayarları + railway.json birleşimidir**; çakışmada dashboard genelde kazanır. Yeni projede **tek tutarlı railway.json** kullan; NIXPACKS/DOCKERFILE karışımından kaçın.

---

## 6. GitHub'dan Deploy — Adım Adım Playbook (Dev Agent İçin)

Yeni bir uygulamayı bu desende Railway'e deploy etmek için:

### 6.1 Railway projesi + servis oluştur
1. Railway Dashboard → **New Project → Deploy from GitHub Repo** → repo'yu yetkilendir/seç.
2. Railway `railway.json`/Dockerfile'ı otomatik algılar.

### 6.2 Servis kaynağını yapılandır (monorepo kritik)
- **.NET monorepo servisi (Yaklaşım A):** Settings → **Root Directory = BOŞ**; Variables → `RAILWAY_DOCKERFILE_PATH=Dockerfile.<servis>`.
- **Node alt-klasör servisi:** Settings → **Root Directory = `workers/<servis>`** (veya Dockerfile Path'i UI'dan ver).

### 6.3 Branch → ortam
- Settings → Source → Branch = `staging` (staging servisi) / `master` (production servisi); **Auto Deploy: Enabled**.

### 6.4 Watch Paths (gereksiz rebuild'i önle)
- WebAPI: `WebAPI/**`, `Business/**`, `Core/**`, `DataAccess/**`, `Entities/**`.
- Worker: `PlantAnalysisWorkerService/**` + aynı paylaşılan kütüphaneler.

### 6.5 Managed plugin'leri ekle (bkz. Bölüm 7)
- PostgreSQL, Redis, RabbitMQ/CloudAMQP → ekle ve reference variable'larla bağla.

### 6.6 Environment variable'ları gir
- Bölüm 8'deki matrise göre; sırları **manuel** (dashboard/sealed) gir, dosyadan commit etme.

### 6.7 Deploy + migrate + doğrula
```bash
# CLI alternatifi
npm install -g @railway/cli
railway login && railway link
railway up                 # manuel deploy (veya git push → auto)

# EF migration (OTOMATİK DEĞİL — manuel çalıştır, bkz. Bölüm 9)
railway run dotnet ef database update \
  --project DataAccess --startup-project WebAPI --context ProjectDbContext

railway logs --tail        # doğrula
```

---

## 7. Managed Plugin'ler & Reference Variables

Railway'de plugin'ler bir kez provision edilir, tüm servislerce **reference variable** ile paylaşılır. Syntax: `${{ServiceName.VARIABLE}}`.

### PostgreSQL
- Railway otomatik sağlar: `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.
- .NET (WebAPI için) doğru formatta ver: `ConnectionStrings__DArchPgContext=Host=${{Postgres.PGHOST}};Port=${{Postgres.PGPORT}};Database=${{Postgres.PGDATABASE}};Username=${{Postgres.PGUSER}};Password=${{Postgres.PGPASSWORD}};SSL Mode=Require;Trust Server Certificate=true`.
- Timeout'a karşı pooling ekle: `...;Timeout=30;Command Timeout=30;Max Pool Size=50;Min Pool Size=5;Pooling=true` ([Railway-Timeout-Fix.md](../claudedocs/Railway-Timeout-Fix.md)).

### Redis
- New → Database → **Add Redis**.
- Private (önerilen): `CacheOptions__Host=${{Redis.RAILWAY_PRIVATE_DOMAIN}}`, `CacheOptions__Port=6379`, `CacheOptions__Password=${{Redis.REDIS_PASSWORD}}`, `CacheOptions__Ssl=false`.
- Node: `REDIS_URL=${{Redis.REDIS_URL}}`.

### RabbitMQ (CloudAMQP)
- `railway add cloudamqp` → `RABBITMQ_URL=${{RabbitMQ.CLOUDAMQP_URL}}` (Node), `RabbitMQ__ConnectionString=...` (.NET).
- CloudAMQP mgmt UI'da kuyrukları oluştur (Durable, 24h TTL): `openai-analysis-queue`, `gemini-analysis-queue`, `anthropic-analysis-queue`, `plant-analysis-results`, `analysis-dlq`.

---

## 8. Environment Variable Matrisi (Özet)

Tam liste için: [RAILWAY_ENVIRONMENT_VARIABLES_CHECKLIST.md](../claudedocs/RAILWAY_ENVIRONMENT_VARIABLES_CHECKLIST.md), [RAILWAY_R2_ENV_VARIABLES.md](../claudedocs/RAILWAY_R2_ENV_VARIABLES.md). Sırlar aşağıda **placeholder**'dır.

### .NET (WebAPI + WorkerService) — kilit değişkenler
| Grup | Değişkenler |
|------|-------------|
| App/URL | `ASPNETCORE_ENVIRONMENT`, `ASPNETCORE_URLS=http://0.0.0.0:8080`, `RAILWAY_DOCKERFILE_PATH` (servis başına), `DOTNET_RUNNING_IN_CONTAINER=true`, `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false` |
| Database | `ConnectionStrings__DArchPgContext` (✅ **asıl bind hedefi**), `DATABASE_CONNECTION_STRING`, `DATABASE_URL` (worker), `TaskSchedulerOptions__ConnectionString` |
| Redis | `CacheOptions__Host/Port/Password/Database/Ssl`, `REDIS_HOST/PORT/PASSWORD`, `UseRedis` |
| RabbitMQ | `RabbitMQ__ConnectionString`, `RabbitMQ__Queues__*`, `UseRabbitMQ`, `WORKER_CONCURRENCY/PREFETCH_COUNT` (worker) |
| JWT | `TokenOptions__SecurityKey` 🔑, `TokenOptions__Issuer/Audience`, `ZIRAAI_INTERNAL_SECRET` 🔑 |
| FileStorage | `FileStorage__Provider`, `FREEIMAGEHOST_API_KEY`, `IMGBB_API_KEY` 🔑, `CLOUDFLARE_R2_*` 🔑 (dashboard-only) |
| Logging | `Logging__LogLevel__*`, `SeriLogConfigurations__FileLogConfiguration__FolderPath` (servis/ortama göre) |
| Feature | `UseHangfire`, `UseElasticsearch`, `TaskScheduler__UseTaskScheduler` |
| Referral | `REQUEST_TOKEN_SECRET` 🔑, `SPONSOR_REQUEST_DEEPLINK_BASE_URL` |

### analysis-worker (Node)
`WORKER_ID`, `NODE_ENV`, `LOG_LEVEL`, `CONCURRENCY=60`, `PREFETCH_COUNT=10`, `RATE_LIMIT=350`, `TIMEOUT=60000`, `USE_PROVIDER_QUEUES`, `PROVIDER_SELECTION_STRATEGY=FIXED`, `PROVIDER_FIXED`, `OPENAI_API_KEY`/`GEMINI_API_KEY`/`ANTHROPIC_API_KEY` 🔑 (≥1), `RABBITMQ_URL` 🔑, `REDIS_URL` 🔑, `REDIS_KEY_PREFIX=ziraai:ratelimit:`.

### dispatcher (Node)
`DISPATCHER_ID`, `PROVIDER_SELECTION_STRATEGY`, `PROVIDER_FIXED`/`AVAILABLE_PROVIDERS`/`PROVIDER_WEIGHTS`, `RABBITMQ_URL` 🔑, `RAW_ANALYSIS_QUEUE`/`OPENAI_QUEUE`/..., `REDIS_URL` 🔑, `REDIS_KEY_PREFIX=ziraai:dispatcher:ratelimit:` (worker'dan farklı!), `RATE_LIMIT_ENABLED`, `RATE_LIMIT_DELAY_MS=30000`, `GEMINI_RATE_LIMIT=500`/`OPENAI_RATE_LIMIT=5000`/`ANTHROPIC_RATE_LIMIT=400`.

> 🔑 = manuel/sealed girilecek gerçek sır. `.env.railway.*` dosyalarındaki `DATABASE_CONNECTION_STRING` bazı dosyalarda **`Host=` öneki eksik** (bozuk) ama uygulama `ConnectionStrings__DArchPgContext`'i bind ettiği için çalışıyor — yeni projede temiz ver.

---

## 9. Health Check, Migration & Runtime Notları

- **/health:** WebAPI'de `MapHealthChecks` değil, düz bir controller ([WebAPI/Controllers/HealthController.cs]) — `[AllowAnonymous] GET /health` → `{status, timestamp, version, environment}`; `/health/detailed` Railway metadata ekler. `railway.json` `healthcheckPath: /health`, `healthcheckTimeout: 300`.
- **PORT:** Uygulama `PORT`'u **tüketmez** ve `UseUrls()` yok; bağlanma tamamen `ASPNETCORE_URLS=http://0.0.0.0:8080` ile. Health + Docker HEALTHCHECK 8080'e sabit → 8080'i değiştirme.
- **EF migration OTOMATİK DEĞİL:** Kodda `Database.Migrate()`/`EnsureCreated()` yok. Şema **manuel** migrate edilmeli (Bölüm 6.7). (Hangfire kendi şemasını `PrepareSchemaIfNecessary=true` ile kurar.)
- **Globalization:** Dockerfile `libicu-dev` kurar + `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false` (Türkçe kültür için — invariant mode'u açma).
- **Npgsql/timestamp:** `Npgsql.EnableLegacyTimestampBehavior=true`, `Npgsql.DisableDateTimeInfinityConversions=true` (Program.cs'te set edili).
- **Restart/rollback:** Her yerde `ON_FAILURE`, max 10 retry. Rollback: Dashboard → Deployments → önceki → Rollback (veya `railway rollback`).

---

## 10. Deployment Doğrulama

- **Pre-deploy (Node):** `node workers/analysis-worker/scripts/validate-deployment.js` — Dockerfile/railway.json/package.json/tsconfig varlığı, builder=DOCKERFILE, multi-stage, non-root user, `.env.example`'da zorunlu değişkenler ve ≥1 API key, `package-lock.json` commit'li mi kontrol eder; hatada non-zero exit.
- **CI (.NET):** [.github/workflows/railway-deploy.yml](../.github/workflows/railway-deploy.yml) — `master`/PR push'ta restore→build→test, sonra Dockerfile/appsettings.Production varlık doğrulaması, ardından Railway auto-deploy.
- **Post-deploy:** `railway logs --tail` / `railway status`; WebAPI `GET /health` → 200, `/swagger` erişimi, DB/JWT/upload testi; Worker logları "Worker started successfully", "Started consuming from queue", RabbitMQ+Redis "connected"; test mesajı → sonuç kuyruğu; DLQ temiz.

---

## 11. Gotcha & Fix Kataloğu

| # | Belirti | Kök neden | Çözüm |
|---|---------|-----------|-------|
| 1 | Build: `Core/Core.csproj not found` | Yanlış build context | Kök Dockerfile + `RAILWAY_DOCKERFILE_PATH` + **Root Directory boş** |
| 2 | appsettings değişikliği etkisiz | Env değişkeni JSON'u eziyor | JSON değil, Railway **env değişkenini** güncelle |
| 3 | DB localhost'a bağlanıyor | Config source sırası | `Program.cs`'te `AddEnvironmentVariables()` **en son** çağrılmalı |
| 4 | Nested key okunmuyor | Tek underscore | **Double underscore** (`A__B__C`), case-sensitive |
| 5 | Redis "connection abort" | SSL uyumsuzluğu | Private ağda `CacheOptions__Ssl=false`, public proxy'de `true` |
| 6 | PostgreSQL 30s timeout | Pool/timeout yok | Connection string'e `Timeout=30;Max Pool Size=50;Pooling=true` ekle |
| 7 | Türkçe kültür hatası | ICU yok / invariant mode | `libicu-dev` + `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false` |
| 8 | Swagger/hata detayı yok | Railway `ASPNETCORE_ENVIRONMENT=Production` zorluyor | Dashboard'da `Staging`/`Development`'a override |
| 9 | Servis başlamıyor/asılıyor | Provision edilmemiş servis flag'i açık | Kullanılmayanları `false`: `UseRabbitMQ/UseRedis/UseHangfire/UseElasticsearch` |
| 10 | Migration yok/şema eksik | Otomatik migrate yok | `railway run dotnet ef database update ...` manuel |
| 11 | Railway yanlış Dockerfile seçiyor | Auto-detect çakışması (çok Dockerfile) | `RAILWAY_DOCKERFILE_PATH` set et; veya benzersiz Dockerfile ismi |

---

## 12. 🔴 Güvenlik: Committed Secrets (Acil)

**Bulgu:** Aşağıdaki dosyalar git'e **commit edilmiş** ve **gerçek/canlı sırlar** içeriyor (doğrulandı: `git ls-files`, `git check-ignore` boş döndü):
- `.env.railway.production`, `.env.railway.staging`, `.env.railway.*.all`, `.env.railway.*.internal.all` (PostgreSQL/Redis/RabbitMQ şifreleri, JWT anahtarları).
- [docs/CI-CD-DEPLOYMENT-GUIDE.md](../docs/CI-CD-DEPLOYMENT-GUIDE.md) (staging & production DB/Redis/RabbitMQ şifreleri + JWT anahtarları, düz metin).

**Bu, projenin dokümanlarının kendi "never commit credentials" kuralını ihlal ediyor.** Öneriler:
1. Tüm bu sırları **rotate et** (DB, Redis, RabbitMQ şifreleri; JWT `SecurityKey`; `REQUEST_TOKEN_SECRET`; API key'ler).
2. `.env.railway.*` ve şifre içeren dokümanları `.gitignore`'a al; git history'den temizle (`git filter-repo`/BFG).
3. Sırları yalnızca Railway dashboard'da (sealed variable) tut.
4. Zayıf hardcoded değerleri düzelt: JWT `ZiraAI-Prod-JWT-SecretKey-2025!@` (min 32+ rastgele), Hangfire `admin/admin123`.

**Yeni uygulamada bu deseni tekrarlama** — dev agent'a: sırlar repoya asla girmez, sadece Railway dashboard'a.

---

## 13. Yeni Uygulama İçin Hızlı Deploy Reçetesi (Dev Agent Checklist)

Bu projenin desenini yeni bir uygulamaya uygularken:

**Repo hazırlığı:**
- [ ] Servis başına Dockerfile (multi-stage; .NET 4-stage / Node 2-stage; non-root user).
- [ ] Monorepo ise: paylaşılan projeler için selective `.csproj` COPY + `COPY . .` + build context = repo kökü.
- [ ] `railway.json` (tutarlı `DOCKERFILE` builder, `healthcheckPath`, `restartPolicy: ON_FAILURE`).
- [ ] `.dockerignore` (bin/obj/node_modules/.git/.env).
- [ ] `/health` endpoint (200 döndüren).
- [ ] `.env.example` (sırlar placeholder, gerçek değer YOK).

**Railway kurulumu:**
- [ ] New Project → Deploy from GitHub Repo.
- [ ] Her servis için: Root Directory (monorepo→boş+`RAILWAY_DOCKERFILE_PATH`; alt-klasör→klasör yolu).
- [ ] Branch→ortam (master→prod, staging→staging), Auto Deploy on.
- [ ] Watch Paths (servis + bağımlı klasörler).
- [ ] Plugin'ler: PostgreSQL + Redis + RabbitMQ; reference variable'larla bağla (`${{Service.VAR}}`).
- [ ] Env değişkenleri: double-underscore, private networking hostları, kullanılmayan servisleri `false`, sırlar sealed.
- [ ] `ASPNETCORE_URLS=http://0.0.0.0:8080` (veya app'in dinlediği port).

**Deploy sonrası:**
- [ ] EF migration'ı manuel çalıştır.
- [ ] `/health` 200, loglar temiz, plugin bağlantıları OK.
- [ ] Rollback prosedürünü doğrula.

---

## 14. Referans Dosyalar

**Docker & Railway config:**
- [Dockerfile.webapi](../Dockerfile.webapi), [Dockerfile.worker](../Dockerfile.worker), [Dockerfile.staging](../Dockerfile.staging), [Dockerfile.production](../Dockerfile.production), [Dockerfile](../Dockerfile)
- [workers/analysis-worker/Dockerfile](../workers/analysis-worker/Dockerfile), [workers/dispatcher/Dockerfile](../workers/dispatcher/Dockerfile)
- [railway.json](../railway.json), [railway.staging.json](../railway.staging.json), [railway.production.json](../railway.production.json), [WebAPI/railway.json](../WebAPI/railway.json), [PlantAnalysisWorkerService/railway.json](../PlantAnalysisWorkerService/railway.json), [workers/analysis-worker/railway.json](../workers/analysis-worker/railway.json)
- [.github/workflows/railway-deploy.yml](../.github/workflows/railway-deploy.yml), [.dockerignore](../.dockerignore)

**Kod:**
- [Core/Utilities/Helpers/RailwayConfigurationHelper.cs](../Core/Utilities/Helpers/RailwayConfigurationHelper.cs)
- [WebAPI/Controllers/HealthController.cs](../WebAPI/Controllers/HealthController.cs)

**Dokümanlar:**
- [docs/RAILWAY_DEPLOYMENT.md](../docs/RAILWAY_DEPLOYMENT.md) (Yaklaşım A — monorepo), [docs/CI-CD-DEPLOYMENT-GUIDE.md](../docs/CI-CD-DEPLOYMENT-GUIDE.md) (Yaklaşım B)
- [docs/RAILWAY_DOCKER_FIX.md](../docs/RAILWAY_DOCKER_FIX.md), [claudedocs/Railway-Timeout-Fix.md](../claudedocs/Railway-Timeout-Fix.md), [claudedocs/RAILWAY_REDIS_SETUP_GUIDE.md](../claudedocs/RAILWAY_REDIS_SETUP_GUIDE.md)
- [claudedocs/RAILWAY_ENVIRONMENT_VARIABLES_CHECKLIST.md](../claudedocs/RAILWAY_ENVIRONMENT_VARIABLES_CHECKLIST.md), [claudedocs/RAILWAY_R2_ENV_VARIABLES.md](../claudedocs/RAILWAY_R2_ENV_VARIABLES.md)
- [workers/claudedocs/PlatformModernization/RAILWAY_STAGING_DEPLOYMENT.md](../workers/claudedocs/PlatformModernization/RAILWAY_STAGING_DEPLOYMENT.md)
