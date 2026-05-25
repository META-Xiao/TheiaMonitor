// Image telemetry protocol debug test
// Target: Arduino Leonardo (ATmega32U4) — 2.5KB SRAM, 32KB Flash

#include <Arduino.h>

#define IMG_W 32
#define IMG_H 32

// ATmega32U4 constants
#define ROM_TOTAL 32768U
#define RAM_TOTAL 2560U

static uint8_t img[IMG_W * IMG_H];

#define N_STARS 48
static uint16_t sx[N_STARS], sy[N_STARS];
static int8_t   svx[N_STARS], svy[N_STARS];
static uint8_t  sbright[N_STARS];

static uint16_t rng = 0xACE1;
static uint8_t rnd() { rng = rng * 25173u + 13849u; return (uint8_t)(rng >> 5); }

static void star_reset(uint8_t i) {
    sx[i] = 16 * 16; sy[i] = 16 * 16;
    int8_t dx = (int8_t)(rnd() % 17) - 8; if (dx == 0) dx = 1;
    int8_t dy = (int8_t)(rnd() % 17) - 8; if (dy == 0) dy = 1;
    svx[i] = dx; svy[i] = dy;
    sbright[i] = 64 + rnd() % 128;
}

static void stars_init() {
    for (uint8_t i = 0; i < N_STARS; i++) {
        star_reset(i);
        sx[i] += (int16_t)(rnd() % 64) - 32;
        sy[i] += (int16_t)(rnd() % 64) - 32;
    }
}

// Integer-only plasma effect: adds variable CPU load each frame
static void render_plasma(uint16_t t) {
    for (uint8_t y = 0; y < IMG_H; y++) {
        for (uint8_t x = 0; x < IMG_W; x++) {
            int16_t a = (int16_t)(x * 8 + t) & 0xFF;
            int16_t b = (int16_t)(y * 6 + t / 2) & 0xFF;
            int16_t c = (int16_t)((x + y) * 5 + t * 3 / 4) & 0xFF;
            if (a > 127) a = 255 - a;
            if (b > 127) b = 255 - b;
            if (c > 127) c = 255 - c;
            uint8_t v = (uint8_t)((a + b + c) / 3 * 2);
            img[y * IMG_W + x] = (img[y * IMG_W + x] / 4) + (v / 4 * 3);
        }
    }
}

// Extra variable-length work: random number of multiply-accumulate ops
static void burn_cycles(uint16_t n) {
    volatile uint16_t acc = rng;
    for (uint16_t i = 0; i < n; i++) acc = acc * 6967u + 1234u;
    rng ^= (uint8_t)acc; // prevent optimizer from removing
}

static void render_frame(uint16_t n) {
    render_plasma(n);
    // variable extra load: 0–512 MACs, driven by rng so it changes every frame
    burn_cycles((uint16_t)rnd() * 8u);
    // overlay stars
    for (uint8_t i = 0; i < N_STARS; i++) {
        sx[i] += svx[i]; sy[i] += svy[i];
        int16_t px = sx[i] >> 4, py = sy[i] >> 4;
        if (px < 0 || px >= IMG_W || py < 0 || py >= IMG_H) { star_reset(i); continue; }
        uint8_t *p = &img[py * IMG_W + px];
        uint8_t b = sbright[i];
        if (b > *p) *p = b;
        sbright[i] = (uint8_t)(64 + rnd() % 128);
    }
}

// Estimate free RAM via stack/heap gap
static uint16_t free_ram() {
    extern int __heap_start, *__brkval;
    int v;
    return (uint16_t)((int)&v - (__brkval == 0 ? (int)&__heap_start : (int)__brkval));
}

static void send_log(const char *text) {
    int len = strlen(text);
    if (len > 256) len = 256;
    uint8_t hdr[3] = { 0xDD, (uint8_t)(len >> 8), (uint8_t)(len & 0xFF) };
    uint8_t cs = 0;
    for (int i = 0; i < 3; i++) cs += hdr[i];
    for (int i = 0; i < len; i++) cs += (uint8_t)text[i];
    Serial.write(hdr, 3);
    Serial.write((const uint8_t *)text, len);
    Serial.write(&cs, 1);
}

static void send_image_frame(uint16_t frame_id) {
    render_frame(frame_id);
    // 0xCC + Length(2B) + Frame(2B) + Width(1B) + Height(1B) + ImageData + CS(1B)
    uint16_t data_len = 4 + IMG_W * IMG_H; // Frame(2) + W(1) + H(1) + pixels
    uint8_t hdr[7] = { 0xCC,
        (uint8_t)(data_len >> 8), (uint8_t)(data_len & 0xFF),
        (uint8_t)(frame_id >> 8), (uint8_t)(frame_id & 0xFF),
        IMG_W, IMG_H };
    uint8_t cs = 0;
    for (int i = 0; i < 7; i++) cs += hdr[i];
    Serial.write(hdr, 7);
    for (int i = 0; i < IMG_W * IMG_H; i++) cs += img[i];
    Serial.write(img, IMG_W * IMG_H);
    Serial.write(&cs, 1);
}

// Resource frame: 0xEE + Length(2B) + Data(Length B) + CS(1B)
// Default preset: CPU(u8) + ROM(u16) + RAM(u16) + Speed(i16) + Servo(i16) = 9B
static void send_resource(uint8_t cpu_pct, int16_t speed, int16_t servo) {
    uint16_t rom_free = ROM_TOTAL - (uint16_t)sizeof(img);  // rough estimate
    uint16_t ram_free = free_ram();

    uint8_t buf[13];
    buf[0]  = 0xEE;
    buf[1]  = 0;                        // Length hi (9)
    buf[2]  = 9;                        // Length lo
    buf[3]  = cpu_pct;                  // CPU u8
    buf[4]  = (uint8_t)(rom_free >> 8);   buf[5]  = (uint8_t)(rom_free & 0xFF);
    buf[6]  = (uint8_t)(ram_free >> 8);   buf[7]  = (uint8_t)(ram_free & 0xFF);
    buf[8]  = (uint8_t)(speed >> 8);      buf[9]  = (uint8_t)(speed & 0xFF);
    buf[10] = (uint8_t)(servo >> 8);      buf[11] = (uint8_t)(servo & 0xFF);
    uint8_t cs = 0;
    for (int i = 0; i < 12; i++) cs += buf[i];
    buf[12] = cs;
    Serial.write(buf, 13);
}

void setup() {
    Serial.begin(115200);
    stars_init();
    delay(3000);
    send_log("[BOOT] image telemetry test started\r\n");
}

static uint16_t frame = 0;

void loop() {
    int16_t speed = (int16_t)(frame % 1000) - 500;
    int16_t servo = (int16_t)(frame % 600) - 300;

    unsigned long t0 = micros();
    send_image_frame(frame++);
    Serial.flush();
    unsigned long elapsed = micros() - t0;
    uint8_t cpu_pct = (uint8_t)min(100UL, elapsed * 100UL / 40000UL);
    send_resource(cpu_pct, speed, servo);

    if (frame % 10 == 0) {
        char buf[64];
        snprintf(buf, sizeof(buf), "[DBG] frame=%u cpu=%u%%\r\n", frame, cpu_pct);
        send_log(buf);
    }
}
