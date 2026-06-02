#include "crc32.h"

uint32_t crc32_update(uint32_t crc, const uint8_t* data, size_t length) {
  crc = crc ^ 0xffffffffUL;
  for (size_t i = 0; i < length; ++i) {
    crc ^= data[i];
    for (uint8_t bit = 0; bit < 8; ++bit) {
      crc = (crc & 1) ? (crc >> 1) ^ 0xedb88320UL : (crc >> 1);
    }
  }
  return crc ^ 0xffffffffUL;
}

uint32_t crc32_bytes(const uint8_t* data, size_t length) {
  return crc32_update(0, data, length);
}
