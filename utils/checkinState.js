/**
 * 当日签到状态持久化。
 *
 * 用于「手动触发立即签到时跳过当日已完成签到的账号」：
 *   - 每次签到运行结束时，把本轮无任何错误完成的账号写入当日状态文件
 *   - 手动触发（CHECKIN_SKIP_DONE=1）时，读取状态文件并直接跳过已完成的账号，
 *     避免对酷狗 API 的重复请求
 *   - 定时任务 / GitHub Actions 不设置该标记，行为与之前完全一致（仍会完整执行）
 *
 * 状态文件默认位于凭据文件同目录（Docker 中为挂载卷 /app/data/checkin_state.json），
 * 按"北京时间日期"滚动，跨天自动失效；文件内容形如：
 *   { "date": "2026-02-06", "done": ["123456789", "987654321"] }
 */

import fs from 'node:fs'
import path from 'node:path'

function stateFile() {
  if (process.env.CHECKIN_STATE_FILE) return process.env.CHECKIN_STATE_FILE
  const base = process.env.USERINFO_FILE
    ? path.dirname(process.env.USERINFO_FILE)
    : path.join(process.cwd(), 'data')
  return path.join(base, 'checkin_state.json')
}

/** 读取今日已完成签到的账号 userid 集合；非当日 / 文件损坏时返回空集合 */
export function loadDoneToday(today) {
  try {
    const text = fs.readFileSync(stateFile(), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(text)
    if (parsed?.date !== today || !Array.isArray(parsed.done)) return new Set()
    return new Set(parsed.done.map(String))
  } catch {
    return new Set()
  }
}

/** 原子化写入当日状态（tmp + rename），失败时静默返回 false（不影响签到流程） */
export function saveDoneToday(today, doneSet) {
  const file = stateFile()
  const tmp = `${file}.tmp`
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(tmp, JSON.stringify({ date: today, done: [...doneSet] }, null, 2), 'utf8')
    fs.renameSync(tmp, file)
    return true
  } catch {
    try { fs.rmSync(tmp, { force: true }) } catch { /* 忽略 */ }
    return false
  }
}

/** 是否应记录/读取签到状态：配置了凭据文件路径（Docker/本地部署），或显式开启了跳过 */
export function checkinStateEnabled(skipDone) {
  return Boolean(process.env.USERINFO_FILE) || skipDone
}
