# Theia Monitor 遥测协议

## 1. 连接方式

MCU 发给上位机的图像、日志、资源数据和命令应答共用一条字节流。USB-CDC、UART 和 Wi‑Fi TCP 使用相同的帧格式。

| 通道 | 连接方法 |
| --- | --- |
| USB-CDC / UART | 在上位机选择串口。物理 UART 用 8N1，默认波特率为 115200 bps，按固件配置调整。 |
| Wi‑Fi TCP | 上位机监听指定端口（默认 `8086`），MCU 主动连接电脑的局域网 IP 和该端口。可选端口为 `1024–65535`。 |

Electron 桌面版直接监听 TCP；网页开发版用 `npm run web` 启动后，由 Vite 上的 Wi‑Fi 桥接监听。MCU 不需要实现 WebSocket，也不需要为桌面版增加一层封包。TCP 一次读取可能只得到半帧，也可能得到多帧，接收端按 `Length` 拼帧。

## 2. 公共帧格式

```text
| Sync (1 B) | Length (2 B, u16 大端) | Body (Length B) | Checksum (1 B) |
```

`Length` 只计 `Body`，不含帧头、长度字段和校验和。整帧长度为 `Length + 4` 字节。校验和是从 `Sync` 到 `Body` 末尾的所有字节之和，取低 8 位；这是累加校验，不是 CRC-8。

```text
Checksum = (Sync + LengthHi + LengthLo + sum(Body)) & 0xFF
```

| Sync | 类型 | Body | Length（字节） |
| --- | --- | --- | --- |
| `0xCC` | 图传 | `FrameID + Width + Height + Format + Payload` | `5 + Payload 大小`，上限 `65535` |
| `0xDD` | 日志 | UTF-8 文本 | `0–256` |
| `0xEE` | 资源 | 按双方配置排列的字段 | 等于数据大小；默认布局为 `9` |
| `0xFF` | CLI 应答 | `Flags + UTF-8 文本` | 建议发 `1–256`；当前解析器兼容到 `257` |

上位机先查找这四种帧头，再按长度读取剩余字节。帧体里的 `0xCC`、`0xDD`、`0xEE`、`0xFF` 是普通数据，不另起一帧。校验失败时丢弃该帧，从下一个未读字节继续找帧头；如果 `Length` 本身损坏，中间的帧也可能一起被跳过。用中断、DMA 或任务并行发送时，应让每一帧完整进入发送队列，避免不同帧的字节交错。

## 3. 图传帧 `0xCC`

```text
Body = FrameID:u16BE + Width:u8 + Height:u8 + Format:u8 + Payload
```

`FrameID` 从 `65535` 回绕到 `0`，上位机可用它检查丢帧。`Width` 和 `Height` 以像素为单位。`Format` 的高 4 位是 `PixelFormat`，低 4 位是 `Codec`。例如 `0x18` 表示 Gray8 + CoordinateBoundary。`Payload` 最多 `65530` 字节。

| PixelFormat | 名称 | 字节布局与支持情况 |
| --- | --- | --- |
| `0` | Binary1 | 行优先，每 8 个像素占 1 字节，先用高位；整图占 `ceil(W × H / 8)` 字节。 |
| `1` | Gray8 | 每像素 1 字节。 |
| `2` | RGB565 | 每像素 2 字节，大端序。 |
| `3` | RGB888 | 每像素依次发送 R、G、B。 |
| `4` | YUV422 | 每像素占 2 字节；当前上位机只读取偶数下标的 Y 分量，按灰度显示。 |
| `5` / `6` / `7` | JPEG / PNG / UserDefined | 编号已定义，当前上位机不解码。 |

| Codec | 名称 | Payload |
| --- | --- | --- |
| `0` | RAW | 完整原始像素数据。 |
| `1` | RLE | 依次发送 `(值:u8, 重复次数:u8)`，压缩的是 RAW 字节。 |
| `2` | HEATSHRINK | 全帧压缩。当前解码器使用窗口位数 `8`、前瞻位数 `4`。 |
| `3` | Tile | 按网格发送变化的区块。 |
| `4` | Patch | 发送覆盖变化区域的一个矩形。 |
| `5` / `6` | Tile+HEATSHRINK / Patch+HEATSHRINK | 编号已定义，当前上位机不解码。 |
| `7` | SparseBoundary | Binary1 / Gray8 底图加逐行边界。 |
| `8` | CoordinateBoundary | Binary1 / Gray8 底图加带坐标空间的点列。 |

### Tile 和 Patch

Tile 的格式为 `Sum:u8 + CutInfo:u8 + (BlockID:u8 + Data) × Sum`。`CutInfo` 高 4 位是纵向块数，低 4 位是横向块数，两者均为 `1–15`。`BlockID` 从 `0` 开始，按行编号。当前解码器把宽、高分别除以块数后向下取整，发送端宜选能整除的网格，避免右边或底部的余边无法更新。

Patch 的格式为 `x1:u8 + y1:u8 + x2:u8 + y2:u8 + Data`，包含左上角和右下角。`Data` 按行发送矩形内的原始像素。

这两种编码当前按 Gray8（每像素 1 字节）或 RGB565（每像素 2 字节）使用。先发完整 RAW 参考帧，再发差分；每次差分解码完成后会更新参考帧。链路丢帧后，建议重新发送完整 RAW 帧，避免后续差分继续用旧图作底图。

### Codec 7：SparseBoundary（MOD1）

```text
Payload = RAW 底图 + LineCount:u8 + (Color:u16BE + Count:u8 + X:u8 × Count) × LineCount
```

`Color` 为 RGB565。每个 X 对应一行，第一项的 Y 为 `0`；`0xFF` 表示该行不画点。`LineCount = 0` 表示只有底图。188×120 的 Gray8 底图附带 3 条各 120 点的线时，`Payload` 为 `22560 + 1 + 3 × 123 = 22930` 字节。

### Codec 8：CoordinateBoundary（MOD2）

```text
Payload = RAW 底图 + LineCount:u8 + Line × LineCount
Line    = Space:u8 + Color:u16BE + Count:u8 + (X:i16BE + Y:i16BE) × Count
```

`Space = 0` 表示原图坐标，`Space = 1` 表示逆透视（IPM）标定矩阵 `H` 输出的坐标。`Color` 为 RGB565。X、Y 都是有符号大端整数，不填画布偏移，也不沿用 Codec 7 的 `0xFF` 规则。无效点在发送端省略；`Count = 0` 表示该线在本帧没有点。每帧独立，即使没有点列也要发 `LineCount = 0`。

MOD2 通常发送选中的红色左边界或蓝色右边界，再加绿色 IPM 中线。上位机在原图视图用 `H⁻¹` 回投 IPM 点；在 IPM 视图用 `H` 投影原图点，再加画布偏移。MCU 和上位机的 `H` 应一致，显示时的裁切和拉伸不改变线上坐标。

## 4. 日志帧 `0xDD`

`Body` 是最多 256 字节的 UTF-8 文本。这里计的是编码后的字节数，不是字符数。日志和 CLI 应答使用不同的帧头，CLI 的执行状态不放在日志帧里。

## 5. 资源帧 `0xEE`

帧内没有字段名或类型标记。MCU 按约定顺序写入字段，上位机根据 Settings → Resources 的配置解释它们。多字节整数用大端序。默认 `Length = 9`（整帧 13 字节）：

| 表达式引用 | 字段 | 类型 | 默认含义 |
| --- | --- | --- | --- |
| `res[0]` | CPU | `u8` | CPU 占用率，单位 `%`。 |
| `res[1]` | RAM | `u16BE` | SRAM 剩余量，单位字节。 |
| `res[2]` | ROM | `u16BE` | Flash 剩余量，单位字节。 |
| `res[3]` | Speed | `i16BE` | 速度，单位 mm/s，界面默认换算为 m/s。 |
| `res[4]` | Servo | `i16BE` | 舵机角度，界面默认除以 10，显示为度。 |

自定义布局时，MCU 与上位机的字段顺序、类型和总长度都要一致。资源表达式引用用 `res[n]`，例如 ROM 占用率是 `(ROM_TOTAL-res[2])/ROM_TOTAL*100`。`ROM_TOTAL` 和 `RAM_TOTAL` 在 Settings → Env 中配置，单位应与剩余量一致。

## 6. CLI 双向通信

上位机发命令时直接发送 UTF-8 文本，以 `\n`（`0x0A`）结束，例如 `set_speed 100\n`。这一路不加帧头、长度或校验和。MCU 按行接收，在相同连接上用 `0xFF` 帧返回输出：

```text
Body = Flags:u8 + Text:UTF-8
Length = 1 + Text 字节数
整帧长度 = 5 + Text 字节数
```

| Flags | 含义 |
| --- | --- |
| `0x00` | 还有输出。 |
| `0x01` | 命令结束。 |
| `0x02` | 出错标志。若命令已结束，发送 `0x03`。 |
| `0x03` | 出错且命令结束。 |

上位机用最低位判断命令是否结束。发送端每帧文本建议不超过 255 字节；长输出分多帧时，在 UTF-8 字符边界拆分，因为上位机逐帧解码。也可以发送一个只有 `Flags = 0x01` 的空文本帧来结束。以下 MCU 示例接收已经切好的完整文本片段；如果还有其他任务在发遥测，请把整个帧交给同一个发送队列。

```c
void cli_send_chunk(const uint8_t *text, uint16_t size, uint8_t flags) {
    if (size > 255) return;
    uint16_t length = 1 + size;
    uint8_t frame[260] = {0xFF, (uint8_t)(length >> 8), (uint8_t)length, flags};
    uint8_t checksum = frame[0] + frame[1] + frame[2] + frame[3];
    for (uint16_t i = 0; i < size; ++i) {
        frame[4 + i] = text[i];
        checksum += text[i];
    }
    frame[4 + size] = checksum;
    uart_write(frame, 5 + size);
}
```

## 7. 联调样例

下列是完整帧，最后一字节为校验和：

| 用途 | 十六进制字节 |
| --- | --- |
| 2×2 Gray8 RAW，帧号 1 | `CC 00 09 00 01 02 02 10 00 40 80 FF A9` |
| 日志 `OK` | `DD 00 02 4F 4B 79` |
| 默认资源帧：CPU 25%，RAM 1024 B，ROM 2048 B，速度 1000 mm/s，舵机 −10° | `EE 00 09 19 04 00 08 00 03 E8 FF 9C A2` |
| CLI 返回 `OK` 并结束 | `FF 00 03 01 4F 4B 9D` |
| CLI 直接结束，不带文本 | `FF 00 01 01 01` |

协议没有固定帧率。物理 UART 使用 8N1 时，每个字节在线路上占 10 位。188×120 的 RGB565 RAW 整帧是 45129 字节，在 115200 bps 下仅发送就约需 3.9 秒。若串口图传太慢，可以先换灰度或二值图，也可以降低采集频率，避免大图传帧挤占日志和 CLI 输出。
