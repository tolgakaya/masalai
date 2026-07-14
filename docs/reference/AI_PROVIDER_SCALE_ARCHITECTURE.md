# AI Provider Kısıtlarına Uygun Scale Mimarisi

**Kapsam:** ZiraAI bitki analizi platformunun, AI provider (OpenAI / Gemini / Anthropic) kısıtları altında (RPM/RPS rate limit, token/payload limitleri, maliyet, sağlık/erişilebilirlik) nasıl güvenli şekilde ölçeklendiğinin mimari + mantıksal açıklaması.

**Hazırlanma tarihi:** 2026-07-12
**Kaynak doğrulaması:** Bu doküman tasarım notlarına değil, çalışan kaynak koduna dayanır. İlgili dosyalar her bölümde referans verilmiştir.

> ⚠️ **Not:** N8N flow'ları bu mimaride **artık kullanılmıyor** (legacy). Kodda kalan `MESSAGE_BASED` stratejisi ve prompt uyumluluğu yalnızca geriye dönük uyumluluk içindir.

---

## 1. Problem: AI Provider Kısıtları

Bir AI provider'a doğrudan, senkron ve kontrolsüz istek atmak üç sınıf kısıta çarpar:

| Kısıt | Açıklama | Doğrudan çağırınca sonuç |
|-------|----------|--------------------------|
| **Rate limit (RPM)** | Provider dakika başına istek sayısını sınırlar (ör. Gemini ~500, OpenAI ~5000, Anthropic ~400 RPM) | `429 Too Many Requests`, istek kaybı |
| **Token / payload limiti** | Görsel base64 olarak gönderilince input token patlar; model context limiti aşılır | Yüksek maliyet + `400`/context overflow |
| **Maliyet farkı** | Provider'lar arası birim maliyet ~44x değişir (Gemini ucuz → Anthropic pahalı) | Kontrolsüz harcama |
| **Erişilebilirlik** | Provider geçici olarak yavaş/erişilemez olabilir | Senkron isteklerde kullanıcı bekler / timeout |

Platform bu dört kısıtı **dört ayrı mimari kararla** karşılar:

1. **Asenkron kuyruk tabanlı decoupling** → istek anında kabul edilir, işlenmesi arka planda kontrollü yapılır (rate limit + erişilebilirlik).
2. **URL-tabanlı görsel gönderimi** → base64 yerine public URL (token/payload).
3. **Dispatcher + provider seçim stratejileri** → maliyet/kalite/yük dengesi (maliyet + yük dağıtımı).
4. **İki katmanlı Redis rate limiting + delayed queue** → provider RPM limitine proaktif uyum (rate limit).

---

## 2. Bileşen Topolojisi

Sistem iki ayrı repository / iki teknoloji katmanından oluşur:

- **.NET 9 (ana repo, `ziraaiv1`)** → API + result consumer + veritabanı.
- **TypeScript / Node.js 18 (`workers/`, ayrı repo `ziraai-workers`)** → dispatcher + provider worker'ları.

Aralarındaki tek entegrasyon yüzeyi **RabbitMQ** (ve rate-limit sayaçları için **Redis**).

```
┌──────────────────────────────────────────────────────────────────────────┐
│  .NET WebAPI (senkron kabul)                                               │
│  PlantAnalysisAsyncServiceV2.PublishToQueueAsync()                         │
│    • Görseli önce public URL'e yükler (base64 GÖNDERMEZ)                    │
│    • PlantAnalysisAsyncRequestDto üretir  → ResponseQueue = "…-results"     │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ publish
                ▼
        ┌───────────────────┐
        │ raw-analysis-queue │  (yeni sistem)   ← veya plant-analysis-requests (eski)
        └─────────┬─────────┘
                  │ consume
                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  DISPATCHER (TS)  — workers/dispatcher/src/dispatcher.ts                    │
│   1) selectProviderQueue(request)  → 6 stratejiden biriyle provider seç     │
│   2) KATMAN-1 RATE LIMIT (Redis sliding window, prevention)                 │
│        ✅ izin var → provider kuyruğuna publish                              │
│        ❌ limit aşıldı → "<queue>-delayed-<ms>ms" kuyruğuna (TTL+DLX)        │
└───┬──────────────────┬───────────────────┬────────────────────────────────┘
    ▼                  ▼                   ▼
openai-analysis-queue  gemini-analysis-queue  anthropic-analysis-queue
    │                  │                   │
    ▼                  ▼                   ▼
┌──────────────┐  ┌──────────────┐   ┌──────────────┐
│ OpenAI Worker│  │ Gemini Worker│   │Anthropic Wrk │   (her biri FIXED strateji)
│ (TS, N replica)│ (TS, N replica)│  │ (TS, N replica)│
│  • prefetch     │  • KATMAN-2     │  •  provider     │
│  • rate limit   │    safety-net   │     API çağrısı  │
└──────┬───────┘  └──────┬───────┘   └──────┬───────┘
       │ publishResult (response_queue)     │
       └──────────────────┬─────────────────┘
                          ▼
                 plant-analysis-results
                          │ consume
                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  .NET PlantAnalysisWorkerService — RabbitMQConsumerWorker                   │
│    • Hangfire job kuyruğa atar → PlantAnalysisJobService → PostgreSQL       │
│    • AnalysisStatus: Processing → Completed / Failed                        │
└──────────────────────────────────────────────────────────────────────────┘

           ┌─────────┐         ┌─────────┐
           │  Redis  │◄────────┤ Rate    │  sliding-window sayaçları
           │ (ZSET)  │         │ Limiter │  dispatcher + worker ayrı prefix
           └─────────┘         └─────────┘
```

**Kaynak referansları:**
- Dispatcher: [workers/dispatcher/src/dispatcher.ts](workers/dispatcher/src/dispatcher.ts)
- Provider seçim: [workers/analysis-worker/src/services/provider-selector.service.ts](workers/analysis-worker/src/services/provider-selector.service.ts)
- Worker giriş: [workers/analysis-worker/src/index.ts](workers/analysis-worker/src/index.ts)
- RabbitMQ servis (worker): [workers/analysis-worker/src/services/rabbitmq.service.ts](workers/analysis-worker/src/services/rabbitmq.service.ts)
- Rate limiter: [workers/analysis-worker/src/services/rate-limiter.service.ts](workers/analysis-worker/src/services/rate-limiter.service.ts)
- .NET publisher: [Business/Services/PlantAnalysis/PlantAnalysisAsyncServiceV2.cs](Business/Services/PlantAnalysis/PlantAnalysisAsyncServiceV2.cs)
- .NET result consumer: [PlantAnalysisWorkerService/Services/RabbitMQConsumerWorker.cs](PlantAnalysisWorkerService/Services/RabbitMQConsumerWorker.cs)

---

## 3. Katman 0 — .NET Publish & Token Optimizasyonu

AI provider kısıtına karşı ilk savunma daha istek kuyruğa girmeden yapılır: **görsel base64 olarak değil, public URL olarak gönderilir.**

### 3.0 Hangi kuyruğa gidileceği: master feature flag

Asıl (flag-duyarlı) publisher [PlantAnalysisAsyncService.cs](Business/Services/PlantAnalysis/PlantAnalysisAsyncService.cs)'tir. Eski/yeni sistem tek bir konfigürasyon anahtarıyla seçilir:

```csharp
_useRawAnalysisQueue = configuration.GetValue<bool>("PlantAnalysis:UseRawAnalysisQueue", false);
...
var queueName = _useRawAnalysisQueue
    ? _rabbitMQOptions.Queues.RawAnalysisRequest    // "raw-analysis-queue"     → Dispatcher (YENİ)
    : _rabbitMQOptions.Queues.PlantAnalysisRequest; // "plant-analysis-requests" → worker doğrudan (ESKİ)
```

> **Kritik senkronizasyon:** .NET tarafındaki `PlantAnalysis:UseRawAnalysisQueue` ile worker tarafındaki `USE_PROVIDER_QUEUES` **aynı yönde** ayarlanmalıdır. Aksi halde ya dispatcher boş kuyruğu dinler ya da mesajlar hiç işlenmez. Kuyruk isimleri [Core/Configuration/RabbitMQOptions.cs](Core/Configuration/RabbitMQOptions.cs)'ta tanımlıdır (`RawAnalysisRequest = "raw-analysis-queue"`).
>
> Multi-image akışı ayrı kuyruklar kullanır: [PlantAnalysisMultiImageAsyncService.cs](Business/Services/PlantAnalysis/PlantAnalysisMultiImageAsyncService.cs) → `plant-analysis-multi-image-requests` / `-results`.
>
> ⚠️ [PlantAnalysisAsyncServiceV2.cs](Business/Services/PlantAnalysis/PlantAnalysisAsyncServiceV2.cs) daha eski bir varyanttır ve flag'e bakmadan **her zaman doğrudan** `PlantAnalysisRequest`'e yayınlar; aşağıdaki DTO örneği ondandır ama üretimdeki dallanma yukarıdaki flag'le yönetilir.

### 3.1 URL-tabanlı görsel (token optimizasyonu)

[PlantAnalysisAsyncServiceV2.cs:199-231](Business/Services/PlantAnalysis/PlantAnalysisAsyncServiceV2.cs#L199-L231):

```csharp
return new PlantAnalysisAsyncRequestDto
{
    ImageUrl = imageUrl,   // NEW: Send URL instead
    Image = null,          // Don't send base64 to avoid token limits
    ...
    ResponseQueue = "plant-analysis-results",
    AnalysisId = analysisId,
    ...
};
```

**Mantık:**
- Vision modeline base64 gömmek input token'ı devasa büyütür. URL geçmek, provider'ın görseli kendisinin çekmesini sağlar → **input token dramatik düşer** (proje dökümantasyonundaki "~%99.6 token azalımı" iddiasının kaynağı budur).
- Payload küçüldüğü için RabbitMQ mesajı da küçük kalır (~2KB), kuyruk throughput'u artar.
- Worker tarafında provider bu URL'i doğrudan modele iletir — örn. OpenAI için `input_image` olarak: [openai.provider.ts:574-589](workers/analysis-worker/src/providers/openai.provider.ts#L574-L589).

Publish hedefi konfigürasyondan gelir ([PlantAnalysisAsyncServiceV2.cs:234-238](Business/Services/PlantAnalysis/PlantAnalysisAsyncServiceV2.cs#L234-L238)):

```csharp
var queueName = _rabbitMQOptions.Queues.PlantAnalysisRequest;
var publishResult = await _messageQueueService.PublishAsync(queueName, asyncRequest, correlationId);
```

Yeni sistemde bu kuyruk `raw-analysis-queue`'ya (dispatcher'ın dinlediği kuyruk), eski sistemde `plant-analysis-requests`'e (worker'ın doğrudan dinlediği kuyruk) yönlendirilir. Geçiş, worker'daki `USE_PROVIDER_QUEUES` feature flag'i ile yönetilir (bkz. Bölüm 5.2).

---

## 4. Katman 1 — Dispatcher (Provider Seçimi + Prevention Rate Limit)

Dispatcher tek görevi olan bir Node.js servisidir: `raw-analysis-queue`'dan mesaj alır, hangi provider'a gideceğine karar verir, ve **kuyruğa atmadan önce** rate limit kontrolü yapar.

### 4.1 Tüketim döngüsü

[dispatcher.ts:83-117](workers/dispatcher/src/dispatcher.ts#L83-L117):

```typescript
await this.channel.consume(queueName, async (msg) => {
  const request = JSON.parse(msg.content.toString());
  const targetQueue = this.selectProviderQueue(request);  // 1) strateji ile seç
  await this.routeToQueue(targetQueue, request);           // 2) rate-limit + publish
  this.channel!.ack(msg);
}, { noAck: false });
```

Hata olursa mesaj DLQ'ya gönderilip ack edilir ([dispatcher.ts:102-114](workers/dispatcher/src/dispatcher.ts#L102-L114)) — yani parse edilemeyen mesajlar sonsuz döngüye girmez.

### 4.2 Altı provider seçim stratejisi

[provider-selector.service.ts:17-23](workers/analysis-worker/src/services/provider-selector.service.ts#L17-L23) ve dispatcher'daki eşleniği ([dispatcher.ts:125-149](workers/dispatcher/src/dispatcher.ts#L125-L149)):

| Strateji | Mantık | Ölçekleme/maliyet etkisi |
|----------|--------|--------------------------|
| **FIXED** | Her zaman tek provider (`PROVIDER_FIXED`) | Deterministik; tek provider'a yük bindirir |
| **ROUND_ROBIN** | Sırayla dağıt (`roundRobinIndex`) | Yükü provider'lara eşit böler → toplam RPM tavanını yükseltir |
| **COST_OPTIMIZED** | Öncelik sırası (varsayılan `gemini→openai→anthropic`) | En ucuzu tercih eder; maliyet minimizasyonu |
| **QUALITY_FIRST** | Öncelik sırası (varsayılan `anthropic→openai→gemini`) | En kaliteliyi tercih eder; maliyet artar |
| **WEIGHTED** | Yüzdesel ağırlıklı rastgele (ör. %50/%30/%20) | Yükü kontrollü oranlarda böler (kademeli geçiş / A-B testi) |
| **MESSAGE_BASED** | Mesajdaki `provider` alanına göre (legacy n8n) | Çağıran tarafın seçmesi |

COST_OPTIMIZED örneği ([dispatcher.ts:180-195](workers/dispatcher/src/dispatcher.ts#L180-L195)):

```typescript
const priorityOrder = this.config.dispatcher.priorityOrder || ['gemini', 'openai', 'anthropic'];
for (const provider of priorityOrder) {
  if (this.availableProviders.includes(provider)) {
    return this.getQueueForProvider(provider);  // ilk erişilebilir olanı seç
  }
}
```

WEIGHTED, ağırlıkları normalize edip `Math.random()` ile kümülatif dilim seçer ([dispatcher.ts:223-255](workers/dispatcher/src/dispatcher.ts#L223-L255)) — böylece trafik istenen oranlarda bölünür.

> **Mimari ayrım (kritik):** Strateji kararı **yalnızca dispatcher'da** verilir. Worker'lar strateji uygulamaz; her worker sabit tek bir kuyruğu dinler (Bölüm 5.2). Bu, "kim seçer / kim işler" sorumluluğunu net ayırır.

### 4.3 Prevention-layer rate limit + delayed queue (TTL + DLX)

Seçilen kuyruğa publish etmeden önce dispatcher Redis'te provider sayaçını kontrol eder ([dispatcher.ts:300-339](workers/dispatcher/src/dispatcher.ts#L300-L339)):

```typescript
if (this.rateLimiter && this.config.rateLimit.enabled) {
  const rateLimit = this.getProviderRateLimit(provider);          // env'den RPM
  const rateLimitAllowed = await this.rateLimiter.checkRateLimit(provider, rateLimit);
  if (!rateLimitAllowed) {
    await this.routeToDelayedQueue(queueName, request, this.config.rateLimit.delayMs);
    return;                                                        // normal kuyruğa GİRMEZ
  }
}
this.channel.sendToQueue(queueName, message, { persistent: true, contentType: 'application/json' });
```

Limit aşıldığında mesaj **kaybolmaz veya reddedilmez**; RabbitMQ'nun yerleşik **TTL + Dead Letter Exchange** mekanizmasıyla geciktirilir ([dispatcher.ts:345-378](workers/dispatcher/src/dispatcher.ts#L345-L378)):

```typescript
const delayedQueueName = `${targetQueue}-delayed-${delayMs}ms`;   // ör. gemini-analysis-queue-delayed-30000ms
await this.channel.assertQueue(delayedQueueName, {
  durable: true,
  arguments: {
    'x-message-ttl': delayMs,                    // delayMs sonra "ölür"
    'x-dead-letter-exchange': '',                // default exchange
    'x-dead-letter-routing-key': targetQueue,    // ölünce hedef kuyruğa route
  }
});
this.channel.sendToQueue(delayedQueueName, message, { persistent: true, ... });
```

**Neden bu desen (requeue yerine)?**
- **Sıfır uygulama kodu / polling yok:** TTL dolunca RabbitMQ mesajı otomatik olarak asıl kuyruğa taşır.
- **Kontrollü gecikme:** Worker'ı NACK/requeue fırtınasına sokmadan, aşan trafiği zamana yayar.
- **Garantili teslim:** Mesaj `persistent` olduğundan broker restart'ında da kaybolmaz.

Örnek davranış (1000 mesaj, Gemini limit 500/dk): ilk 500 → `gemini-analysis-queue`, sonraki 500 → `gemini-analysis-queue-delayed-30000ms`, 30 sn sonra otomatik asıl kuyruğa akar. Net sonuç: **%0 hata, gecikmeli ama tam teslim.**

---

## 5. Katman 2 — Worker'lar (İşleme + Safety-Net)

### 5.1 Provider soyutlaması

Worker basit bir arayüz üzerinden çalışır ([index.ts:13-15](workers/analysis-worker/src/index.ts#L13-L15)):

```typescript
interface AIProvider {
  analyzeImages(message: PlantAnalysisAsyncRequestDto): Promise<PlantAnalysisAsyncResponseDto>;
}
```

Üç somut implementasyon — hepsi C#-uyumlu aynı response DTO'sunu döndürür (mixed snake_case/PascalCase, [openai.provider.ts:6-13](workers/analysis-worker/src/providers/openai.provider.ts#L6-L13)):

| Provider | Varsayılan model | Birim maliyet (input/output $/1M) | qualityScore | Çıktı token limiti |
|----------|------------------|-----------------------------------|--------------|--------------------|
| gemini | `gemini-2.0-flash-exp` | 0.075 / 0.30 | 7 | `maxOutputTokens: 16000`, `responseMimeType: application/json` |
| openai | `gpt-4o-mini` (yeni `/v1/responses` API, raw `fetch`) | 0.25 / 2.00 | 8 | — |
| anthropic | `claude-3-5-sonnet-20241022` | 3.00 / 15.00 | 10 | `max_tokens: 2000` |

Metadata seçim stratejilerini besler ([provider-selector.service.ts:60-82](workers/analysis-worker/src/services/provider-selector.service.ts#L60-L82)) ve runtime'da `PROVIDER_METADATA` env'i ile güncellenebilir ([index.ts:70-78](workers/analysis-worker/src/index.ts#L70-L78)) — maliyetler değişince kod deploy'u gerekmez.

Provider hangi API key'i verilmişse o başlatılır ([index.ts:91-121](workers/analysis-worker/src/index.ts#L91-L121)); en az bir key zorunludur. OpenAI provider'ı token kullanımını ve USD/TRY maliyetini hesaplayıp response'a ekler ([openai.provider.ts:594-620](workers/analysis-worker/src/providers/openai.provider.ts#L594-L620)) → maliyet gözlemlenebilirliği.

### 5.2 Kuyruk tüketimi: neden worker FIXED olmak zorunda

Worker iki moddan birinde çalışır ([index.ts:240-329](workers/analysis-worker/src/index.ts#L240-L329)), `USE_PROVIDER_QUEUES` flag'i ile:

- **`true` (yeni sistem):** Worker **tek bir provider kuyruğunu** dinler. Bunun için stratejisi **FIXED olmak ZORUNDA** — değilse başlatılırken hata fırlatır ([index.ts:254-264](workers/analysis-worker/src/index.ts#L254-L264)):

  ```typescript
  if (this.config.providerSelection.strategy !== 'FIXED') {
    throw new Error(`Worker strategy must be FIXED when USE_PROVIDER_QUEUES=true...`);
  }
  ```
  Mantık: dağıtım kararı dispatcher'ın; worker sadece kendi provider'ının kuyruğunu boşaltan bir "tüketici havuzu"dur. Böylece **her provider bağımsız ölçeklenir** — Gemini worker'ı 10 replica, Anthropic worker'ı 2 replica olabilir.

- **`false` (legacy):** Worker doğrudan WebAPI kuyruklarını (`plant-analysis-requests` + multi-image) dinler ([index.ts:306-329](workers/analysis-worker/src/index.ts#L306-L329)).

### 5.3 Yatay ölçekleme kaldıraçları

| Kaldıraç | Nerede | Varsayılan | Etki |
|----------|--------|-----------|------|
| **prefetch (QoS)** | [rabbitmq.service.ts:53-54](workers/analysis-worker/src/services/rabbitmq.service.ts#L53-L54) | `PREFETCH_COUNT=10` | Bir worker'ın aynı anda kaç mesaj çekeceği; adil dağıtım + eşzamanlılık |
| **concurrency** | [index.ts:179](workers/analysis-worker/src/index.ts#L179) | `CONCURRENCY=60` | Mantıksal eşzamanlı işleme hedefi |
| **replica sayısı** | Railway deployment | provider başına ayrı | Aynı kuyruğa N worker bağlanır → RabbitMQ mesajları round-robin böler |
| **provider RPM** | env (`*_RATE_LIMIT`) | 500/5000/400 | Her provider'ın güvenli tavanı |

RabbitMQ'nun **competing consumers** modeli: aynı kuyruğa bağlı N worker mesajları paylaşır; prefetch her worker'ın eşzamanlı yükünü sınırlar. Ölçek büyütmek = daha fazla replica + prefetch ayarı.

### 5.4 Safety-net rate limit (Katman 2)

Worker, işlemeden önce **kendi** Redis sayaçında (farklı prefix) tekrar kontrol yapar ([index.ts:397-417](workers/analysis-worker/src/index.ts#L397-L417)):

```typescript
const rateLimitAllowed = await this.rateLimiter.checkRateLimit(selectedProvider, this.config.provider.rateLimit);
if (!rateLimitAllowed) {
  throw new Error('RATE_LIMIT_EXCEEDED_AT_WORKER');   // NACK+requeue tetiklemek için
}
```

Amaç: dispatcher'ın atlandığı nadir senaryolar (birden çok dispatcher instance, clock skew, doğrudan kuyruğa mesaj). `rabbitmq.service.ts` tüketicisi bu özel hatayı yakalayıp **requeue** (NACK requeue=true), diğer tüm hataları **DLQ**'ya (requeue=false) yönlendirecek şekilde tasarlanmıştır ([rabbitmq.service.ts:166-199](workers/analysis-worker/src/services/rabbitmq.service.ts#L166-L199)):

```typescript
if (errorMessage === 'RATE_LIMIT_EXCEEDED_AT_WORKER') {
  this.channel?.nack(msg, false, true);   // requeue → otomatik retry
} else {
  this.channel?.nack(msg, false, false);  // DLQ
}
```

> ⚠️ **Kodda gözlemlenen tutarsızlık (dikkat):** Mevcut [index.ts:383-454](workers/analysis-worker/src/index.ts#L383-L454) içindeki `processMessage`, `try/catch` bloğu **kendi** rate-limit hatasını da yakalıyor ve `buildErrorResponse` ile bir **hata yanıtı publish ediyor** (errorCount++), hatayı yukarı fırlatmıyor. Dolayısıyla `rabbitmq.service.ts`'deki smart-NACK/requeue yolu bu path'te **tetiklenmiyor** — mesaj her durumda ACK ediliyor. Yani worker safety-net'i pratikte "requeue" yerine "hata yanıtı" üretiyor. İki katmanlı tasarımın tam çalışması için, rate-limit hatasının `processMessage` içinde re-throw edilmesi gerekir. Bu, gerçek scale davranışını değerlendirirken bilinmesi gereken bir nokta. (Karşılaştırma: [TWO_TIER_RATE_LIMITING_ARCHITECTURE.md](../workers/claudedocs/PlatformModernization/TWO_TIER_RATE_LIMITING_ARCHITECTURE.md) tasarımı re-throw öngörüyor.)

---

## 6. Rate Limiter: Redis Sliding Window

İki katman da aynı `RateLimiterService`'i, yalnızca **farklı Redis key prefix'iyle** kullanır ([rate-limiter.service.ts:42-81](workers/analysis-worker/src/services/rate-limiter.service.ts#L42-L81)):

```typescript
async checkRateLimit(provider: string, limit: number): Promise<boolean> {
  const key = `${this.config.keyPrefix}${provider}`;      // ör. ziraai:dispatcher:ratelimit:gemini
  const now = Date.now();
  const windowStart = now - 60000;                         // 60 sn kayan pencere
  await this.redis.zremrangebyscore(key, '-inf', windowStart);  // eski kayıtları at
  const currentCount = await this.redis.zcard(key);        // penceredeki istek sayısı
  const allowed = currentCount < limit;
  if (allowed) {
    const pipeline = this.redis.pipeline();
    pipeline.zadd(key, now, `${now}-${Math.random()}`);    // bu isteği kaydet
    pipeline.expire(key, this.config.ttl);
    await pipeline.exec();
  }
  return allowed;
}
```

**Tasarım özellikleri:**
- **Sliding window (ZSET):** Sabit pencereye göre daha adil; ani sınır sıçramalarını (burst) engeller.
- **Merkezi:** Redis'te tutulduğu için **birden çok worker/dispatcher instance aynı sayaçı paylaşır** — yatay ölçekte limit gerçekten global kalır.
- **İki bağımsız katman:** `ziraai:dispatcher:ratelimit:*` vs `ziraai:worker:ratelimit:*` → sayaçlar çakışmaz.
- **Fail-open:** Redis erişilemezse `checkRateLimit` `true` döner ([rate-limiter.service.ts:70-80](workers/analysis-worker/src/services/rate-limiter.service.ts#L70-L80)) — Redis kesintisi tüm trafiği bloke etmesin diye. (Trade-off: Redis çökerse rate limit geçici olarak devre dışı kalır.)
- **`waitForRateLimit`:** Exponential backoff + jitter ile bekleme yardımcı fonksiyonu da mevcut ([rate-limiter.service.ts:156-194](workers/analysis-worker/src/services/rate-limiter.service.ts#L156-L194)), ancak asıl akış "bekle" yerine "geciktir/requeue" desenini kullanır.

---

## 7. Sonuç Akışı & Hata Yönetimi

### 7.1 Sonuç geri dönüşü ve DB yazımı
Worker, provider yanıtını `response_queue` alanına göre yayınlar ([rabbitmq.service.ts:206-243](workers/analysis-worker/src/services/rabbitmq.service.ts#L206-L243)) — mesajda `response_queue` yoksa varsayılan `plant-analysis-results`'a düşer. Multi-image senaryosunda farklı `response_queue` kullanılabildiği için akış esnektir (`RabbitMQMultiImageConsumerWorker` → `plant-analysis-multi-image-results`).

.NET tarafında akış şöyledir:
1. [RabbitMQConsumerWorker.cs](PlantAnalysisWorkerService/Services/RabbitMQConsumerWorker.cs) `plant-analysis-results`'ı tüketir (`autoAck: false`), mesajı deserialize edip **doğrudan DB'ye yazmaz** — bir **Hangfire** job'u kuyruğa atar: `BackgroundJob.Enqueue<IPlantAnalysisJobService>(...)`, sonra `BasicAck`. Böylece consumer hızlı kalır; asıl işleme eşzamanlılığını Hangfire sağlar. (Bu yüzden .NET result consumer'da **prefetch/QoS ayarlanmaz**.)
2. `PlantAnalysisWorkerService/Jobs/PlantAnalysisJobService.cs` — `[AutomaticRetry(Attempts=3, DelaysInSeconds={30,60,120})]` ile: kaydı `AnalysisId`'ye göre bulur, tüm analiz bölümlerini map'ler, `AnalysisStatus` = `"Completed"` (hata yolunda `"Failed"`) yapar, `SaveChangesAsync()` çağırır ve referral/subscription/notification yan etkilerini tetikler.
3. **Durum yaşam döngüsü:** kayıt publish anında `"Processing"` olarak yaratılır → sonuç geldiğinde `"Completed"`/`"Failed"` olur. Publish başarısızsa `"QueueFailed"` ([PlantAnalysisAsyncServiceV2.cs:240-247](Business/Services/PlantAnalysis/PlantAnalysisAsyncServiceV2.cs#L240-L247)).

### 7.2 Dayanıklılık mekanizmaları

| Mekanizma | Konum | Davranış |
|-----------|-------|----------|
| **DLQ** | dispatcher + worker | Parse/işleme hatası → `analysis-dlq`; sonsuz retry yok |
| **24h TTL** | tüm analiz kuyrukları | `x-message-ttl: 86400000` → zombi mesaj birikmez ([dispatcher.ts:47-57](workers/dispatcher/src/dispatcher.ts#L47-L57)) |
| **Otomatik reconnect** | worker | Bağlantı/kanal kapanınca `reconnectDelay` ile yeniden bağlanır ([rabbitmq.service.ts:274-293](workers/analysis-worker/src/services/rabbitmq.service.ts#L274-L293)) |
| **PRECONDITION_FAILED toleransı** | worker | Kuyruk farklı config'le varsa kanalı yeniden yaratıp devam eder ([rabbitmq.service.ts:97-119](workers/analysis-worker/src/services/rabbitmq.service.ts#L97-L119)) |
| **persistent mesaj** | her publish | Broker restart'ında mesaj kaybı yok |
| **provider `maxRetries`** | OpenAI SDK | `maxRetries: 3`, `timeout: 60000` ([openai.provider.ts:24-28](workers/analysis-worker/src/providers/openai.provider.ts#L24-L28)) |
| **health check** | worker | provider + RabbitMQ + Redis periyodik kontrol ([index.ts:598-628](workers/analysis-worker/src/index.ts#L598-L628)) |
| **graceful shutdown** | worker/dispatcher | SIGTERM/SIGINT'te bağlantıları kapatır → deploy sırasında mesaj kaybı azalır |

> **Not (failover yok):** Provider seviyesinde otomatik **cross-provider failover** (ör. OpenAI 429 → Anthropic'e kaydır) mevcut kodda **yoktur**. Provider seçimi dispatch anında sabitlenir; bir provider'ın kuyruğuna düşen mesaj o provider tarafından işlenir. Failover'a en yakın davranış, dispatcher'ın `availableProviders` listesi ve öncelik sırasıdır (erişilemez provider listeden çıkarılırsa devreye girer), ama runtime'da provider hatası üzerine dinamik yeniden yönlendirme yapılmaz.

> **Not (circuit breaker tasarlanmış ama implement edilmemiş):** [workers/analysis-worker/src/types/config.ts](workers/analysis-worker/src/types/config.ts) içinde `CircuitBreakerConfig` (failureThreshold / successThreshold / timeout / monitoringWindow) ve `routingStrategy: 'least-loaded'` gibi tip tanımları vardır, ancak dispatcher/worker kodunda **hiçbir yerde kullanılmaz** — yalnızca tip düzeyinde niyet beyanıdır. Dolayısıyla gerçek dayanıklılık DLQ + delayed-queue + reconnect + fail-open üçlüsüne dayanır; circuit breaker davranışı henüz yoktur. Dispatcher'daki `MAX_RETRY_ATTEMPTS`/`RETRY_DELAY_MS` da tanımlı olup routing'de aktif kullanılmaz.

---

## 8. Konfigürasyon Referansı (Ölçek Ayar Düğmeleri)

### Dispatcher (`workers/dispatcher/.env`)
| Env | Varsayılan | İşlev |
|-----|-----------|-------|
| `PROVIDER_SELECTION_STRATEGY` | `FIXED` | 6 stratejiden biri |
| `PROVIDER_FIXED` | `openai` | FIXED için provider |
| `PROVIDER_PRIORITY_ORDER` | `gemini,openai,anthropic` | COST/QUALITY sıralaması |
| `RATE_LIMIT_ENABLED` | `true` | Katman-1 aç/kapa (anında rollback) |
| `RATE_LIMIT_DELAY_MS` | `30000` | Delayed queue TTL |
| `GEMINI_RATE_LIMIT` / `OPENAI_RATE_LIMIT` / `ANTHROPIC_RATE_LIMIT` | 500 / 5000 / 400 | Provider RPM |
| `REDIS_KEY_PREFIX` | `ziraai:dispatcher:ratelimit:` | Katman-1 sayaç izolasyonu |

### Worker (`workers/analysis-worker/.env`)
| Env | Varsayılan | İşlev |
|-----|-----------|-------|
| `USE_PROVIDER_QUEUES` | — (`true` yeni sistem) | Kuyruk modu seçimi |
| `PROVIDER_SELECTION_STRATEGY` | `ROUND_ROBIN` (yeni sistemde `FIXED` zorunlu) | — |
| `PROVIDER_FIXED` | — | Dinlenecek provider kuyruğu |
| `PREFETCH_COUNT` | `10` | Eşzamanlı çekilen mesaj |
| `CONCURRENCY` | `60` | Mantıksal eşzamanlılık |
| `RATE_LIMIT` | `350` | Worker safety-net RPM |
| `REDIS_KEY_PREFIX` | `ziraai:worker:ratelimit:` (tasarım) / `ziraai:ratelimit:` (kod varsayılanı) | Katman-2 sayaç izolasyonu |
| `*_API_KEY`, `*_MODEL` | — | Provider anahtar/model |
| `PROVIDER_METADATA` | — | Runtime maliyet/kalite override (JSON) |

> Kaynak: [index.ts:126-184](workers/analysis-worker/src/index.ts#L126-L184), [dispatcher.ts:396-404](workers/dispatcher/src/dispatcher.ts#L396-L404). Tam liste için [ENVIRONMENT_VARIABLES_REFERENCE.md](../workers/claudedocs/PlatformModernization/ENVIRONMENT_VARIABLES_REFERENCE.md).

---

## 9. Scale Playbook — Pratik Senaryolar

**Trafik arttı, gecikme büyüyor:**
1. İlgili provider worker'ının **replica sayısını** artır (Railway) → aynı kuyruğu paylaşan tüketici sayısı artar.
2. `PREFETCH_COUNT`'u yükselt (I/O-bound iş için daha yüksek eşzamanlılık).
3. Provider gerçek RPM limitini kaldırıyorsa `*_RATE_LIMIT`'i yükselt.

**Maliyeti düşür:** `PROVIDER_SELECTION_STRATEGY=COST_OPTIMIZED`, `PROVIDER_PRIORITY_ORDER=gemini,openai,anthropic`.

**Kaliteyi öne al:** `QUALITY_FIRST` + `anthropic,openai,gemini` (maliyet artışını kabul ederek).

**Yeni provider'a kademeli geçiş:** `WEIGHTED` ile %90 eski / %10 yeni başlat, metrikleri izle, oranı kaydır.

**Provider 429 fırtınası:** Katman-1 zaten delayed queue'ya kaydırır. Kalıcıysa `*_RATE_LIMIT`'i gerçek limite indir; `RATE_LIMIT_DELAY_MS`'i pencereyle uyumlu ayarla.

**Acil geri alma:** `RATE_LIMIT_ENABLED=false` → tüm mesajlar doğrudan provider kuyruğuna (kod değişikliği gerekmez).

---

## 10. Özet — Tasarımın Mantığı

| Kısıt | Çözüm | Katman |
|-------|-------|--------|
| Token/payload | Base64 yerine URL | .NET publisher |
| Sürekli kuyruk yükü / provider yavaşlığı | Asenkron RabbitMQ decoupling | Tüm akış |
| Maliyet/kalite dengesi | 6 provider seçim stratejisi | Dispatcher |
| Provider RPM (proaktif) | Redis sliding-window + delayed queue (TTL+DLX) | Dispatcher (Katman-1) |
| Provider RPM (güvenlik ağı) | Worker Redis sayaç + NACK/requeue | Worker (Katman-2)* |
| Bağımsız ölçekleme | provider başına ayrı kuyruk + FIXED worker + replica | Worker |
| Dayanıklılık | DLQ + TTL + reconnect + persistent + health check | Tüm akış |

**Özün özü:** *Kabul et → decouple et → akıllıca yönlendir → kuyruğa girmeden önce sınırla → provider başına bağımsız ölçekle → sonucu asenkron geri yaz.* AI provider kısıtı hiçbir zaman kullanıcının senkron isteğine yansımaz; tüm baskı kuyruk + rate-limit katmanında soğurulur.

*(\*) Katman-2'nin requeue davranışı için Bölüm 5.4'teki kod tutarsızlığı notuna bakınız.*

---

## Referans Kaynak Dosyalar

**TypeScript (`workers/`):**
- [dispatcher/src/dispatcher.ts](workers/dispatcher/src/dispatcher.ts)
- [analysis-worker/src/index.ts](workers/analysis-worker/src/index.ts)
- [analysis-worker/src/services/provider-selector.service.ts](workers/analysis-worker/src/services/provider-selector.service.ts)
- [analysis-worker/src/services/rabbitmq.service.ts](workers/analysis-worker/src/services/rabbitmq.service.ts)
- [analysis-worker/src/services/rate-limiter.service.ts](workers/analysis-worker/src/services/rate-limiter.service.ts)
- [analysis-worker/src/providers/openai.provider.ts](workers/analysis-worker/src/providers/openai.provider.ts) (+ `gemini.provider.ts`, `anthropic.provider.ts`)

**.NET (ana repo):**
- [Business/Services/PlantAnalysis/PlantAnalysisAsyncServiceV2.cs](Business/Services/PlantAnalysis/PlantAnalysisAsyncServiceV2.cs)
- [PlantAnalysisWorkerService/Services/RabbitMQConsumerWorker.cs](PlantAnalysisWorkerService/Services/RabbitMQConsumerWorker.cs)
- [Business/Services/MessageQueue/SimpleRabbitMQService.cs](Business/Services/MessageQueue/SimpleRabbitMQService.cs)

**Mevcut tasarım dökümanları (`workers/claudedocs/PlatformModernization/`):**
- `TWO_TIER_RATE_LIMITING_ARCHITECTURE.md`, `PROVIDER_SELECTION_STRATEGIES.md`, `DISPATCHER_PRIORITY_ORDER_CONFIGURATION.md`, `DYNAMIC_PROVIDER_METADATA.md`, `PHASE1_DAY3_4_RABBITMQ_SETUP.md`
