# 图传混合协议设计文档

## 1. 协议概览

**目标**：统一传输图像、日志、资源信息，供上位机实时显示与分析

**通道配置**
- 波特率: xxxxx bps，帧格式 8N1
- 通道: USB-CDC / UART（无线转串口）
- 编码: 二进制多帧混合协议

---

## 2. 帧类型定义

### 2.1 图传帧 (0xCC) 

```
┌─────┬────────┬───────┬───────┬─────────┬─────────┬───────────┬───────┐
│ ID  │ Length │ Frame │ Width │ Height  │ Format  │ Payload   │ CRC8  |
├─────┼────────┼───────┼───────┼─────────┼─────────┼───────────┼───────┤
│ 0xCC│ (2B)   │ (2B)  │ (1B)  │ (1B)    │ (1B)    │ xxB       | (1B)  │
└─────┴────────┴───────┴───────┴─────────┴─────────┴───────────┴───────┘
```

**字段说明** ：
- `Length`: 该数据帧内容长度（去掉帧头和校验和`CRC8`的数据长度），Host用于确定边界
- `Frame`: 帧计数器（0-65535，u16），上位机通过 Frame 增量 + 时间戳即可评估接收帧率
- `Width`: 图像宽度（像素，u8）
- `Height`: 图像高度（像素，u8）
- `Format`: 高4位表示PixelFormat `Payload` 原始像素数据格式（u8），低4位表示Codec 对于该格式下的编码方式  

    **PixelFormat**:

    | 值 | 名称 | 说明 |
    |----|------|------|
    | `0` | Binary1 | 二值化图（1bpp），每8像素打包为1B，常用于巡线/阈值化图像 |
    | `1` | Gray8 | 灰度图（8bpp） |
    | `2` | RGB565 | 彩色图（16bpp），大端序：`RRRRRGGG GGGBBBBB` |
    | `3` | RGB888 | 真彩色图（24bpp），顺序：R G B |
    | `4` | YUV422 | 色度抽样格式（16bpp），每2像素共享一组UV，常用于摄像头原始输出 |
    | `5` | JPEG | 有损压缩图像，Payload 为完整 JPEG 数据流 |
    | `6` | PNG | 无损压缩图像，Payload 为完整 PNG 数据流 |
    | `7` | UserDefined | 用户自定义格式，上位机通过插件/脚本解析 |

    **Codec**:

    | 值 | 名称 | 说明 |
    |----|------|------|
    | `0` | RAW | 按 PixelFormat 格式输出的完整原始图像，不做任何压缩 |
    | `1` | RLE | 游程编码，连续相同数据压缩为 `<val, len>` 对，适合二值化图和灰度图 |
    | `2` | HEATSHRINK | 面向MCU的小型LZ压缩算法，支持Streaming，RAM占用低（不代表没有占用，至少8KB的占用是存在的，而且对CPU要求也有不小要求） |
    | `3` | Tile | 变化检测：分块对比I/P帧，仅传输变化区块（无熵编码，调试用） |
    | `4` | Patch | 变化检测：最小矩形覆盖变化区域，传矩形内RAW数据（无熵编码，调试用） |
    | `5` | Tile+HEATSHRINK | Tile 变化检测后 HEATSHRINK 压缩变化区块数据 |
    | `6` | Patch+HEATSHRINK | Patch 变化检测后 HEATSHRINK 压缩矩形内数据 |
    | `7` | SparseBoundary | 灰度/二值底图 + 边界坐标分离传输（PixelFormat 0/1 专用） |

    **Codec 3 — Tile 编码格式**：

    将图像按 `CutInfo` 指定的网格划分，比较 I/P 帧找出变化的区块，Payload 格式：

    ```
    | Sum  | CutInfo | BlockID | Data | BlockID | Data | ... |
    | 1B   | 1B      | 1B      | ...  | 1B      | ...  | ... |
    ```

    - `Sum`（1B）：变化区块的数量
    - `CutInfo`（1B）：高4位=height划分数，低4位=width划分数。最大 16×16=256 块
    - `BlockID`（1B）：变化区块的一维下标（行优先，0-255）
    - `Data`：该区块的RAW像素数据，每个区块尺寸 = `(W/块数_w) × (H/块数_h) × bpp`

    **Codec 4 — Patch 编码格式**：

    找到覆盖所有变化像素的最小矩形，Payload 格式：

    ```
    | x1 | y1 | x2 | y2 | Data |
    | 1B | 1B | 1B | 1B | ...  |
    ```

    - `(x1, y1)`：变化矩形左上角坐标（含）
    - `(x2, y2)`：变化矩形右下角坐标（含）
    - `Data`：矩形内RAW像素数据，行优先，尺寸 = `(x2-x1+1) × (y2-y1+1) × bpp`

    **Codec 5/6 — 复合编码**：

    Codec 5（Tile+HEATSHRINK）：Tile 变化检测 → 拼接变化区块 → HEATSHRINK 压缩。
    Codec 6（Patch+HEATSHRINK）：Patch 变化检测 → 拼接变化矩形 → HEATSHRINK 压缩。

    **Codec 7 — SparseBoundary 编码**（仅 PixelFormat 0/1）：

    灰度或二值化底图与赛道边界坐标**分离传输**。Host 收到后在灰度图上渲染彩色边界线。

    **适用 PixelFormat**: `Binary1` (0), `Gray8` (1)

    **Payload 格式**:

    ```
    | ImageData  | LineCount | [Color | Count | X[0]...X[Count-1] ] × N |
    | raw pixels | 1B        | 2B RGB565 BE | 1B | 1B each               |
    ```

    - `ImageData`: 按 PixelFormat 的原始像素数据（Gray8 = W×H B, Binary1 = ceil(W×H/8) B）
    - `LineCount`: 边界线数量（0-255，0 表示纯底图无标注）
    - `Color`: RGB565 大端，该线的绘制颜色
    - `Count`: 坐标点数（通常 = 图像高度 H）
    - `X[i]`: 第 i 行的 X 坐标（Y 隐式 = i，坐标 < 255 用 8-bit）

    **188×120 示例**（3 线 左红/中绿/右蓝）：

    | 部分 | 大小 |
    |------|------|
    | ImageData (Gray8) | 22,560 B |
    | LineCount | 1 B |
    | 左线 (Color+Count+120X) | 123 B |
    | 中线 | 123 B |
    | 右线 | 123 B |
    | **总 Payload** | **22,930 B** |

    > 相比 RGB565 RAW 的 45,120 B 减半。结合 Tile (8.2) 可进一步压缩。

    > **I/P 帧机制**：上位机始终缓存上一有效帧的 RAW 数据。P 帧（Codec 3/4/5）依赖 I 帧解码，I 帧丢失时上位机丢弃后续 P 帧直至收到新 I 帧（通常定期插入）。

---

### 2.2 日志帧 (0xDD)

**帧结构**:
```
┌─────┬────────┬────────────┬──────────┐
│ ID  │ Length │ LogData    │ Checksum │
├─────┼────────┼────────────┼──────────┤
│ 0xDD│ (2B)   │ (0-256B)   │ (1B)     │
└─────┴────────┴────────────┴──────────┘
```

**字段说明**:
- `Length`: 日志数据字节数（u16）
- `LogData`: UTF-8 文本内容
- `Checksum`: 校验和，所有字节和 & 0xFF 的结果（含帧头 0xDD）

**总字节数**: 4 + N（N=0-256）  
**上位机处理**: 文本解析->控制台显示

---

### 2.3 资源帧 (0xEE)

**帧结构**:

这里资源帧使用高度自定义的字段，可以根据需求扩展。

```
┌─────┬──────────┬──────────┬──────────┬────────────┬──────────────┬──────────┐
│ ID  │ Length   │ Block1   │ Block2   │ Block3     │ ...          │ Checksum │
├─────┼──────────┼──────────┼──────────┼────────────┼──────────────┼──────────┤
│ 0xEE│ (2B)     │ (2B u16) │ (2B u16) │ (2B i16)   │ (xB xxx)     │ (1B)     │
└─────┴──────────┴──────────┴──────────┴────────────┴──────────────┴──────────┘
```

这里资源帧内的划分块，可以根据需求扩展，然后在上位机的Settings -> Resources 中配置就行。

**字段说明**：

- `Length`: 资源数据字节数（uint16 大端，最大 256），即帧头之后、校验和之前的总字节数，不包括帧头、Length 字段和校验和。例如这个就是 $(6+x)B$
- `Block1`: 资源数据块1（uint16 大端）
- `Block2`: 资源数据块2（uint16 大端）
- `Block3`: 资源数据块3（int16 大端）
- `...`: 其他资源数据块（里面的数据类型自定义）
- `Checksum`: 校验和，所有字节和 & 0xFF 的结果（含帧头 0xEE）

这里给出默认例子：

```
┌─────┬──────────┬──────────┬──────────┬────────────┬────────────┬────────────┬──────────┐
│ ID  │ Length   │ CPUUsage │ RAM      │ ROM        │ Speed      │ ServoAngle │ Checksum |
├─────┼──────────┼──────────┼──────────┼────────────┼────────────┼────────────┼──────────┤
│ 0xEE│ (2B)     │ (1B) %   │ (2B u16) │ (2B u16)   │ (2B i16)   │ (2B i16)   │ (1B)     |
└─────┴──────────┴──────────┴──────────┴────────────┴────────────┴────────────┴──────────┘
```

**字段说明**:
- `Length`: 资源数据字节数，这里是 $9B$（= CPU(1) + ROM(2) + RAM(2) + Speed(2) + Servo(2)）
- `CPUUsage`: CPU 占用率（%，uint8，范围 0-100）
- `RAM`: SRAM 剩余字节数（uint16 大端）；分母 `RAM_TOTAL` 在上位机 Settings -> Env 中配置
- `ROM`: Flash 剩余字节数（uint16 大端）；分母 `ROM_TOTAL` 在上位机 Settings -> Env 中配置
- `Speed`: 前进速度（mm/s，int16 大端，正=前进，负=后退）
- `ServoAngle`: 舵机偏转角度（int16 大端，单位由 MCU 定义）
- `Checksum`: 校验和，所有字节和 & 0xFF 的结果（含帧头 0xEE）

**总字节数**: 13B


并且对于每个数据块得到的结果，在上位机中表示为：`Block[idx]` idx就是数据块的下标（0-base）  
上位机显示的数据可用自定义计算结果，例如我设计的`Block[2]` 是传出MCU的ROM剩余字节数，但是我又想在host的图表中显示ROM的占用率，那么就可以通过`(ROM_TOTAL - Block[2]) / ROM_TOTAL`来计算 ，并填入 Setting -> Resources Frame -> ROM -> Expr 中，这里的`ROM_TOTAL`就是上位机中设置的ROM总大小，在Setting -> Env 添加环境变量。

## 2.4 CLI 帧 (0xFF)

**方向**：MCU → Host（单向，Host 不发此帧）

**帧结构**：

```
┌─────┬────────┬──────────────┬──────────┐
│ ID  │ Length │ Text         │ Checksum │
├─────┼────────┼──────────────┼──────────┤
│ 0xFF│ (2B)   │ (0-256B)     │ (1B)     │
└─────┴────────┴──────────────┴──────────┘
```

**字段说明**：
- `Length`: 文本字节数（uint16 大端，最大 256）
- `Text`: UTF-8 编码的命令输出文本块，可含 `\n`、`\r\n`
- `Checksum`: 所有字节和 & 0xFF（含帧头 0xFF）

**总字节数**: 4 + N（0~256）

---

## 3. 校验和算法

所有帧的校验和计算方式相同：将帧内**所有字节**（含帧头 ID 字节）逐一累加，取低 8 位。

```
checksum = (byte[0] + byte[1] + ... + byte[N-1]) & 0xFF
```

校验和字节本身不参与计算，位于帧末尾。

---

## 4. 帧同步与错误恢复

上位机解析时，以帧头字节（0xCC / 0xDD / 0xEE）作为同步标志：

1. 逐字节扫描，遇到已知帧头则开始解析对应帧
2. 若校验和不匹配，丢弃该帧，继续向后扫描下一个帧头
3. 未知字节直接跳过

---

## 5. 时序与帧率

### 5.1 Host 端行为

**Host 不设帧率上限。** Host 只按帧头逐帧解析，MCU 发多快它就收多快。帧率达到什么水平完全取决于 MCU 的渲染能力 + 串口带宽，与 Host 无关。

### 5.2 实际帧率

帧率完全由 MCU 端决定，Host 不设任何限制：

- **USB-CDC**：虚拟波特率，实际带宽为数 Mbps，小帧（<1KB）的传输时间可忽略不计。瓶颈在 MCU 渲染速度，不在传输。实测 64×64 1bpp 可达 150+ FPS。
- **物理 UART / 无线串口**：带宽受限于实际波特率。115200 bps 下，188×120 RGB565（~22KB）纯传输约 2 秒，是大帧的真正瓶颈。

> **实际 FPS = MCU 渲染时间 + 传输时间（UART 下显著，CDC 下可忽略）。** Host 只被动解析，帧率变化对它透明。

### 5.3 动态帧率（FreeRTOS）

使用 RTOS 时，帧率可以**自适应系统负载**：

- **`vTaskDelayUntil(tick, floor)`**：设短地板（如 5ms），实际帧率由渲染+传输时间自然决定。场景简单→帧率自动上升；场景复杂→自动下降。
- **事件驱动暂停**：`ulTaskNotifyTake()` 深度阻塞，暂停期间 CPU 利用率为 0；`xTaskNotifyGive()` 微秒级唤醒。
- **TX 反压**：当 `Serial` 缓冲区满时 `write()` 自然阻塞 → 任务让出 CPU → 其他任务获得时间片。

Host 端始终无感知——它只看到帧来得快或慢，不需要任何协议层面的流控字段。

图传帧体积远大于其他帧，MCU 端建议使用异步/DMA 发送以避免阻塞。

---

## 6. 上位机解析伪代码

```python
while True:
    byte = read_byte()

    if byte == 0xCC:          # 图传帧
        length    = read_uint16_be()   # 帧头后总字节数
        frame_id  = read_uint16_be()
        width     = read_uint8()
        height    = read_uint8()
        format    = read_uint8()
        pixel_fmt = (format >> 4) & 0x0F   # 高4位: PixelFormat
        codec     = format & 0x0F           # 低4位: Codec
        # Payload 字节数 = length - 5 (已读 Frame+Width+Height+Format)
        payload_size = length - 5
        payload  = read_bytes(payload_size)
        checksum = read_uint8()
        # 验证校验和

        # 解码
        raw = None
        if codec == 0:       # RAW
            raw = payload
        elif codec == 1:     # RLE
            raw = rle_decode(payload, width, height, pixel_fmt)
        elif codec == 2:     # HEATSHRINK
            raw = heatshrink_decompress(payload)
        elif codec == 3:     # Tile (P帧，无熵编码)
            raw = tile_decode(payload, last_i_frame)
        elif codec == 4:     # Patch (P帧，无熵编码)
            raw = patch_decode(payload, last_i_frame)
        elif codec == 5:     # Tile+HEATSHRINK (P帧，复合)
            raw = tile_decode(heatshrink_decompress(payload), last_i_frame)
        elif codec == 6:     # Patch+HEATSHRINK (P帧，复合)
            raw = patch_decode(heatshrink_decompress(payload), last_i_frame)

        if raw is not None:
            last_i_frame = raw  # 缓存为下一 P 帧的参考帧
            display(raw, width, height, pixel_fmt)

    elif byte == 0xDD:        # 日志帧
        length    = read_uint16_be()
        log_data  = read_bytes(length)
        checksum  = read_uint8()
        # 验证校验和后输出 UTF-8 文本

    elif byte == 0xEE:        # 资源帧
        length    = read_uint16_be()
        data      = read_bytes(length)
        checksum  = read_uint8()
        # 根据 Settings -> Resources 配置的 slot 列表动态解析 data
        # 例如配置为 [u8, u16, u16, i16, i16] 则：
        #   cpu = data[0]
        #   rom = (data[1]<<8) | data[2]
        #   ram = (data[3]<<8) | data[4]
        #   speed = int16_from_be(data[5:7])
        #   servo = int16_from_be(data[7:9])

    elif byte == 0xFF:        # CLI 输出帧
        length    = read_uint16_be()
        flags     = read_uint8()
        text      = read_bytes(length - 1).decode('utf-8')
        checksum  = read_uint8()
        # 验证校验和后，将 text 流式追加到上位机 CLI 终端输出区
        # flags & 0x01 == 1 表示命令结束，显示输入提示符
        cli_output_append(text, done=(flags & 0x01))
```

---

## 2.4 CLI 帧 (0xFF)

**方向**：MCU → Host（单向，Host 不发此帧）

**帧结构**：

```
┌─────┬────────┬───────┬──────────────┬──────────┐
│ ID  │ Length │ Flags │ Text         │ Checksum │
├─────┼────────┼───────┼──────────────┼──────────┤
│ 0xFF│ (2B)   │ (1B)  │ (0-255B)     │ (1B)     │
└─────┴────────┴───────┴──────────────┴──────────┘
```

**字段说明**：
- `Length`: Flags + Text 的总字节数（uint16 大端，最小 1）
- `Flags`: 执行状态标志（uint8）

  | 值 | 名称 | 说明 |
  |----|------|------|
  | `0x00` | CONT | 命令仍在执行，后续还有输出 |
  | `0x01` | END  | 命令执行完毕 |
  | `0x02` | ERR  | 命令执行出错（可与 END 组合：`0x03`） |

- `Text`: UTF-8 编码的输出文本块，可含 `\n`、`\r\n`，可为空（仅发 Flags）
- `Checksum`: 所有字节和 & 0xFF（含帧头 0xFF）

**总字节数**: 4 + N（N = 0–255）

---

## 7. CLI 通信机制

### 7.1 Host → MCU（命令发送）

Host 直接发送原始 UTF-8 字节，**不封装帧**：

```
<command> <args...>\n
```

- 以 `\n`（0x0A）结尾作为命令终止符
- MCU 端通过 UART 中断或 DMA 接收，按 `\n` 分割解析命令
- 命令格式：`函数名 [参数...]`，空格分隔，例如 `set_speed 100`、`get_status`

### 7.2 MCU → Host（应答输出）

MCU 执行命令后，通过 **0xFF 帧**返回输出：

- 每帧携带 `Flags` 字节，Host 据此控制终端输入行的显示
- `CONT`（0x00）：命令仍在执行，Host 隐藏输入提示符，继续追加输出
- `END`（0x01）：命令完成，Host 显示输入提示符，允许下一条命令
- `ERR`（0x02）或 `END|ERR`（0x03）：命令出错，Host 可高亮显示
- 每帧 Text 最多 255 字节，长输出自动分帧；可发仅含 Flags 的空文本帧作为结束信号
- 0xFF 帧与其他遥测帧（0xCC/0xDD/0xEE）混合传输，互不干扰

### 7.3 MCU 端实现要点

```c
#define CLI_CONT 0x00
#define CLI_END  0x01
#define CLI_ERR  0x02

void cli_send(const char *text, uint8_t flags) {
    uint16_t tlen = strlen(text);
    if (tlen > 255) tlen = 255;
    uint16_t length = 1 + tlen;  // Flags(1) + Text
    uint8_t hdr[3] = { 0xFF, (uint8_t)(length >> 8), (uint8_t)(length & 0xFF) };
    uint8_t cs = 0;
    for (int i = 0; i < 3; i++) cs += hdr[i];
    cs += flags;
    for (uint16_t i = 0; i < tlen; i++) cs += (uint8_t)text[i];
    uart_write(hdr, 3);
    uart_write(&flags, 1);
    uart_write((uint8_t*)text, tlen);
    uart_write(&cs, 1);
}
```

---

## 8. TODO / 未来优化

### 8.2 Tile 编码用于灰度/二值图

Gray8/Binary1 + Tile 变化检测（类似现有 RGB565 Tile），P 帧仅发送变化的灰度/二值块。
- Gray8: 每块 12×12×1 = 144B（vs RGB565 的 288B，减半）
- Binary1: 每块 12×12/8 = 18B（vs RGB565 的 288B，**16 倍压缩**）
- 结合 SparseBoundary: P 帧 = 变化块 + 变化边界线，极致省带宽

---

**文档版本**: 3.5
**更新日期**: 2026-05-29
