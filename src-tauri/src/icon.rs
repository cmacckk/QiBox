//! 从 Windows PE 文件（exe/dll）里抽出图标，拼成标准 ICO 字节。
//!
//! 只做只读解析：读 PE 头 → 找到资源目录 → 找 RT_GROUP_ICON + RT_ICON →
//! 按 ICO 结构重新拼装。不执行目标程序，也不写任何文件。

const RT_ICON: u32 = 3;
const RT_GROUP_ICON: u32 = 14;

#[derive(Clone, Copy)]
struct Section {
    virtual_address: u32,
    virtual_size: u32,
    raw_pointer: u32,
    raw_size: u32,
}

fn u16_at(data: &[u8], offset: usize) -> Option<u16> {
    let slice = data.get(offset..offset + 2)?;
    Some(u16::from_le_bytes([slice[0], slice[1]]))
}

fn u32_at(data: &[u8], offset: usize) -> Option<u32> {
    let slice = data.get(offset..offset + 4)?;
    Some(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

struct PeFile<'a> {
    data: &'a [u8],
    sections: Vec<Section>,
    resource_base: usize,
}

impl<'a> PeFile<'a> {
    fn parse(data: &'a [u8]) -> Option<Self> {
        if data.get(0..2)? != b"MZ" {
            return None;
        }
        let pe_offset = u32_at(data, 0x3c)? as usize;
        if data.get(pe_offset..pe_offset + 4)? != b"PE\0\0" {
            return None;
        }
        let coff = pe_offset + 4;
        let section_count = u16_at(data, coff + 2)? as usize;
        let optional_size = u16_at(data, coff + 16)? as usize;
        let optional = coff + 20;
        let magic = u16_at(data, optional)?;
        // DataDirectory 从 OptionalHeader + 96（PE32）/ +112（PE32+）开始，
        // 资源是第 3 项（索引 2），每项 8 字节。
        let data_directory = match magic {
            0x10b => optional + 96,
            0x20b => optional + 112,
            _ => return None,
        };
        let resource_dir = data_directory + 2 * 8;
        let resource_rva = u32_at(data, resource_dir)?;
        let section_table = optional + optional_size;
        let mut sections = Vec::with_capacity(section_count);
        for index in 0..section_count {
            let header = section_table + index * 40;
            sections.push(Section {
                virtual_size: u32_at(data, header + 8)?,
                virtual_address: u32_at(data, header + 12)?,
                raw_size: u32_at(data, header + 16)?,
                raw_pointer: u32_at(data, header + 20)?,
            });
        }
        let pe = PeFile {
            data,
            sections,
            resource_base: 0,
        };
        let resource_base = pe.rva_to_offset(resource_rva)?;
        Some(PeFile {
            data,
            sections: pe.sections,
            resource_base,
        })
    }

    fn rva_to_offset(&self, rva: u32) -> Option<usize> {
        for section in &self.sections {
            let size = section.virtual_size.max(section.raw_size);
            if rva >= section.virtual_address && rva < section.virtual_address + size {
                let delta = rva - section.virtual_address;
                if delta >= section.raw_size {
                    return None;
                }
                return Some((section.raw_pointer + delta) as usize);
            }
        }
        None
    }

    /// 读一个资源目录的子项：(id, 文件偏移, 是否是子目录)。
    fn dir_entries(&self, dir_offset: usize) -> Vec<(u32, usize, bool)> {
        let named = u16_at(self.data, dir_offset + 12).unwrap_or(0) as usize;
        let ids = u16_at(self.data, dir_offset + 14).unwrap_or(0) as usize;
        let mut out = Vec::with_capacity(named + ids);
        for index in 0..named + ids {
            let entry = dir_offset + 16 + index * 8;
            let name = u32_at(self.data, entry).unwrap_or(0);
            let raw = u32_at(self.data, entry + 4).unwrap_or(0);
            let is_dir = raw & 0x8000_0000 != 0;
            let offset = self.resource_base + (raw & 0x7fff_ffff) as usize;
            out.push((name, offset, is_dir));
        }
        out
    }

    /// 在 type/name/language 三级目录里取第一个数据块。
    fn first_blob(&self, type_id: u32, name_id: u32) -> Option<&'a [u8]> {
        let type_entry = self
            .dir_entries(self.resource_base)
            .into_iter()
            .find(|(id, _, is_dir)| *id == type_id && *is_dir)?;
        let name_entry = self
            .dir_entries(type_entry.1)
            .into_iter()
            .find(|(id, _, is_dir)| *id == name_id && *is_dir)?;
        let data_entry = self
            .dir_entries(name_entry.1)
            .into_iter()
            .find(|(_, _, is_dir)| !*is_dir)?;
        let rva = u32_at(self.data, data_entry.1)?;
        let size = u32_at(self.data, data_entry.1 + 4)? as usize;
        let offset = self.rva_to_offset(rva)?;
        self.data.get(offset..offset + size)
    }

    /// 所有图标组的 (名字 id, 组数据)。
    fn icon_groups(&self) -> Vec<(u32, &'a [u8])> {
        let mut out = Vec::new();
        let Some(root) = self
            .dir_entries(self.resource_base)
            .into_iter()
            .find(|(id, _, is_dir)| *id == RT_GROUP_ICON && *is_dir)
        else {
            return out;
        };
        for (name_id, name_offset, is_dir) in self.dir_entries(root.1) {
            if !is_dir {
                continue;
            }
            if let Some(blob) = self.first_blob(RT_GROUP_ICON, name_id) {
                let _ = name_offset;
                out.push((name_id, blob));
            }
        }
        out
    }
}

struct IconEntry {
    header: [u8; 8],
    icon_id: u32,
}

/// 组图标结构：6 字节头 + count 个 14 字节条目。
fn group_entries(group: &[u8]) -> Option<Vec<IconEntry>> {
    let count = u16_at(group, 4)? as usize;
    if count == 0 || count > 256 {
        return None;
    }
    let mut out = Vec::with_capacity(count);
    for index in 0..count {
        let base = 6 + index * 14;
        let entry = group.get(base..base + 14)?;
        out.push(IconEntry {
            header: [
                entry[0], entry[1], entry[2], entry[3], entry[4], entry[5], entry[6], entry[7],
            ],
            icon_id: u16_at(group, base + 12)? as u32,
        });
    }
    Some(out)
}

fn build_ico(header_entries: &[IconEntry], blobs: &[Vec<u8>]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&[0, 0, 1, 0]);
    out.extend_from_slice(&(header_entries.len() as u16).to_le_bytes());
    let mut offset = 6 + header_entries.len() as u32 * 16;
    for (entry, blob) in header_entries.iter().zip(blobs.iter()) {
        out.extend_from_slice(&entry.header);
        out.extend_from_slice(&(blob.len() as u32).to_le_bytes());
        out.extend_from_slice(&offset.to_le_bytes());
        offset += blob.len() as u32;
    }
    for blob in blobs {
        out.extend_from_slice(blob);
    }
    out
}

/// 从 PE 字节里抽主图标；找不到图标资源返回 None。
pub fn extract_icon(data: &[u8]) -> Option<Vec<u8>> {
    let pe = PeFile::parse(data)?;
    let mut best: Option<(u64, Vec<IconEntry>, Vec<Vec<u8>>)> = None;
    for (_, group) in pe.icon_groups() {
        let Some(entries) = group_entries(group) else {
            continue;
        };
        let mut blobs = Vec::with_capacity(entries.len());
        let mut kept = Vec::with_capacity(entries.len());
        let mut score = 0u64;
        for entry in entries {
            let Some(blob) = pe.first_blob(RT_ICON, entry.icon_id) else {
                continue;
            };
            let width = if entry.header[0] == 0 {
                256
            } else {
                entry.header[0] as u64
            };
            let height = if entry.header[1] == 0 {
                256
            } else {
                entry.header[1] as u64
            };
            score += width * height;
            kept.push(entry);
            blobs.push(blob.to_vec());
        }
        if kept.is_empty() {
            continue;
        }
        if best
            .as_ref()
            .map(|(current, _, _)| score > *current)
            .unwrap_or(true)
        {
            best = Some((score, kept, blobs));
        }
    }
    let (_, entries, blobs) = best?;
    Some(build_ico(&entries, &blobs))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_pe_data() {
        assert!(extract_icon(b"not a pe file").is_none());
    }

    #[test]
    fn extracts_icon_from_system_cmd() {
        // notepad 在新系统上是打包应用（无 PE 图标资源），cmd.exe 一直有。
        let path = std::path::Path::new("C:/Windows/System32/cmd.exe");
        if !path.exists() {
            return;
        }
        let bytes = std::fs::read(path).expect("读 cmd.exe 失败");
        let icon = extract_icon(&bytes).expect("cmd.exe 应该有图标资源");
        assert_eq!(&icon[0..4], &[0, 0, 1, 0], "ICO 头不对");
        let count = u16::from_le_bytes([icon[4], icon[5]]) as usize;
        assert!(count >= 1, "至少要有 1 个图标帧");
        assert!(icon.len() > 32, "ICO 内容太短");
    }
}
