export type SimpleCovJsonResult = {
  coverage: RawCoverages
  groups: RawGroups
}

type RawCoverages = {
  [filename: string]: RawCoverage
}

type RawCoverage = {
  lines: LineCoverage
  branches: BranchCoverage
}

type RawGroups = {
  [name: string]: RawGroup
}

type RawGroup = {
  lines: LineGroup
}

type LineGroup = {
  covered_percent: number
}

type LineCoverage = (number | null)[]

type BranchCoverage = BranchEntry[]

type BranchEntry = {
  type: string
  start_line: number
  end_line: number
  coverage: number
}

type FileCoverage = {
  filename: string
  lines: number
  branches: number
}

type GroupCoverage = {
  name: string
  covered_percent: number
}

function floor(n: number, digits = 0): number {
  const d = Math.pow(10, digits)
  const x = Math.floor(n * d)
  return x / d
}

function linesCoverage(coverage: LineCoverage): number {
  const effectiveLines = coverage.filter(hit => hit !== null) as number[]
  const rows = effectiveLines.length
  if (rows === 0) {
    return 100
  }

  const covered = effectiveLines.filter(hit => hit > 0).length
  return floor((covered / rows) * 100, 2)
}

function branchesCoverages(coverage: BranchCoverage): number {
  if (coverage.length === 0) {
    return 100
  }

  let total = 0
  let covered = 0
  for (const k of coverage) {
    total += 1
    if (k.coverage > 0) {
      covered += 1
    }
  }

  return floor((covered / total) * 100, 2)
}

export class Coverage {
  files: FileCoverage[]
  groups: GroupCoverage[]

  constructor(resultset: SimpleCovJsonResult) {
    this.files = []
    for (const [filename, coverage] of Object.entries(resultset.coverage)) {
      this.files.push({
        filename,
        lines: linesCoverage(coverage.lines),
        branches: branchesCoverages(coverage.branches)
      })
    }
    this.groups = []
    for (const [name, info] of Object.entries(resultset.groups)) {
      this.groups.push({
        name: name,
        covered_percent: info.lines.covered_percent
      })
    }
  }

  filesMap(): Map<string, FileCoverage> {
    const map = new Map<string, FileCoverage>()
    for (const fileCov of this.files) {
      map.set(fileCov.filename, fileCov)
    }
    return map
  }

  groupsMap(): Map<string, GroupCoverage> {
    const map = new Map<string, GroupCoverage>()
    for (const groupCov of this.groups) {
      map.set(groupCov.name, groupCov)
    }
    return map
  }
}

export function getCoverageDiff(
  cov1: Coverage,
  cov2: Coverage
): FileCoverageDiff[] {
  const diff: FileCoverageDiff[] = []
  const cov1Files = cov1.filesMap()
  const cov2Files = cov2.filesMap()
  for (const filename of mergeFilenames(cov1, cov2)) {
    const fcov1 = cov1Files.get(filename)
    const fcov2 = cov2Files.get(filename)
    if (isDifference(fcov1, fcov2)) {
      diff.push(makeDiff(fcov1, fcov2))
    }
  }
  return diff
}

export function getGroupDiff(
  cov1: Coverage,
  cov2: Coverage,
  diffOnly: boolean
): GroupCoverageDiff[] {
  const diff: GroupCoverageDiff[] = []
  const cov1Groups = cov1.groupsMap()
  const cov2Groups = cov2.groupsMap()
  for (const groupName of mergeGroups(cov1, cov2)) {
    const fcov1 = cov1Groups.get(groupName)
    const fcov2 = cov2Groups.get(groupName)
    if (diffOnly) {
      if (fcov1?.covered_percent !== fcov2?.covered_percent) {
        diff.push(makeGroupDiff(fcov1, fcov2))
      }
    } else {
      diff.push(makeGroupDiff(fcov1, fcov2))
    }
  }
  return diff
}

function mergeFilenames(cov1: Coverage, cov2: Coverage): string[] {
  const files1 = cov1.files.map(f => f.filename)
  const files2 = cov2.files.map(f => f.filename)
  const files = new Set<string>([...files1, ...files2])
  return Array.from(files).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

function mergeGroups(cov1: Coverage, cov2: Coverage): string[] {
  const files1 = cov1.groups.map(f => f.name)
  const files2 = cov2.groups.map(f => f.name)
  const files = new Set<string>([...files1, ...files2])
  return Array.from(files).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

function isDifference(cov1?: FileCoverage, cov2?: FileCoverage): boolean {
  if (cov1 === cov2) {
    return false
  }
  if (cov1 && !cov2) {
    return true
  }
  if (!cov1 && cov2) {
    return true
  }
  if (cov1!.lines !== cov2!.lines) {
    return true
  }
  if (cov1!.branches !== cov2!.branches) {
    return true
  }
  return false
}

export type FileCoverageDiff = {
  filename: string
  lines: {
    from: number | null
    to: number | null
  }
  branches: {
    from: number | null
    to: number | null
  }
}

export type GroupCoverageDiff = {
  name: string
  from: number | null
  to: number | null
}

function makeDiff(cov1?: FileCoverage, cov2?: FileCoverage): FileCoverageDiff {
  if (!cov1 && !cov2) {
    throw new Error('no coverages')
  }

  if (!cov1 && cov2) {
    return {
      filename: cov2.filename,
      lines: {from: null, to: cov2.lines},
      branches: {from: null, to: cov2.branches}
    }
  }
  if (!cov2 && cov1) {
    return {
      filename: cov1.filename,
      lines: {from: cov1.lines, to: null},
      branches: {from: cov1.branches, to: null}
    }
  }
  return {
    filename: cov1!.filename,
    lines: {from: cov1!.lines, to: cov2!.lines},
    branches: {from: cov1!.branches, to: cov2!.branches}
  }
}

function makeGroupDiff(
  cov1?: GroupCoverage,
  cov2?: GroupCoverage
): GroupCoverageDiff {
  if (!cov1 && !cov2) {
    throw new Error('no coverages')
  }

  if (!cov1 && cov2) {
    return {
      name: cov2.name,
      from: null,
      to: cov2.covered_percent
    }
  }

  if (!cov2 && cov1) {
    return {
      name: cov1.name,
      from: cov1.covered_percent,
      to: null
    }
  }

  return {
    name: cov1!.name,
    from: cov1!.covered_percent,
    to: cov2!.covered_percent
  }
}
