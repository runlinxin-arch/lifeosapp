import { useDevStore } from '../../stores/devStore'

// Task 8/9/10 会用完整实现整体替换本文件
export function ProjectDetail({ projectId }: { projectId: number }): JSX.Element {
  const project = useDevStore((s) => s.projects.find((p) => p.id === projectId))
  return (
    <div className="text-xs text-[var(--muted)]">
      项目详情（看板 / Bug / 计时统计）将在 Task 8-10 实现
      {project ? ` · ${project.name}` : ''}
    </div>
  )
}
