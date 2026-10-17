import { useState } from 'react'
import type { FormEvent } from 'react'
import { Archive, ArrowDownRight, ArrowUpRight, CheckCircle2, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import type { Category, TransactionType } from '../../electron/preload'

export type CategoryEditor = { category?: Category; defaultType: TransactionType }

export function CategoriesView({
  categories,
  showArchived,
  onToggleArchived,
  onCreate,
  onEdit,
  onArchive,
  onRestore,
  onDelete
}: {
  categories: Category[]
  showArchived: boolean
  onToggleArchived: () => void
  onCreate: (type: TransactionType) => void
  onEdit: (category: Category) => void
  onArchive: (id: number) => void
  onRestore: (id: number) => void
  onDelete: (id: number) => void
}) {
  const visibleCategories = showArchived ? categories : categories.filter((category) => category.is_archived === 0)
  const expenseCategories = visibleCategories.filter((category) => category.type === 'expense')
  const incomeCategories = visibleCategories.filter((category) => category.type === 'income')
  const activeCount = categories.filter((category) => category.is_archived === 0).length
  const archivedCount = categories.filter((category) => category.is_archived === 1).length

  return (
    <div className="full-panel category-page">
      <div className="list-toolbar category-toolbar">
        <div>
          <span className="card-kicker">CATEGORIES</span>
          <h2>收支分类</h2>
          <p>管理记账时使用的收入与支出分类。已归档分类不会出现在新的记账表单中。</p>
        </div>
        <div className="category-toolbar-actions">
          <button className={`secondary-button archive-toggle ${showArchived ? 'selected' : ''}`} onClick={onToggleArchived}>
            <Archive size={15} />{showArchived ? '隐藏已归档' : `已归档 ${archivedCount}`}
          </button>
          <button className="primary-button" onClick={() => onCreate('expense')}><Plus size={18} />新建分类</button>
        </div>
      </div>

      <div className="category-summary"><span><strong>{activeCount}</strong> 个启用分类</span><span>{archivedCount > 0 ? `${archivedCount} 个已归档` : '暂无已归档分类'}</span></div>

      <div className="category-groups">
        <CategoryGroup title="支出分类" type="expense" categories={expenseCategories} onCreate={onCreate} onEdit={onEdit} onArchive={onArchive} onRestore={onRestore} onDelete={onDelete} />
        <CategoryGroup title="收入分类" type="income" categories={incomeCategories} onCreate={onCreate} onEdit={onEdit} onArchive={onArchive} onRestore={onRestore} onDelete={onDelete} />
      </div>
    </div>
  )
}

function CategoryGroup({ title, type, categories, onCreate, onEdit, onArchive, onRestore, onDelete }: { title: string; type: TransactionType; categories: Category[]; onCreate: (type: TransactionType) => void; onEdit: (category: Category) => void; onArchive: (id: number) => void; onRestore: (id: number) => void; onDelete: (id: number) => void }) {
  return (
    <section className="category-group">
      <div className="category-group-heading"><div><span className={`category-type-dot ${type}`} /> <h3>{title}</h3><span className="category-count">{categories.length}</span></div><button className="text-button" onClick={() => onCreate(type)}><Plus size={14} />添加</button></div>
      {categories.length > 0 ? <div className="category-list">{categories.map((category) => <CategoryRow key={category.id} category={category} onEdit={onEdit} onArchive={onArchive} onRestore={onRestore} onDelete={onDelete} />)}</div> : <div className="category-empty">还没有{type === 'expense' ? '支出' : '收入'}分类</div>}
    </section>
  )
}

function CategoryRow({ category, onEdit, onArchive, onRestore, onDelete }: { category: Category; onEdit: (category: Category) => void; onArchive: (id: number) => void; onRestore: (id: number) => void; onDelete: (id: number) => void }) {
  const archived = category.is_archived === 1
  return <div className={`category-row ${archived ? 'archived' : ''}`}><div className="category-color-dot" style={{ backgroundColor: category.color }} /><div className="category-row-main"><strong>{category.name}</strong><span>{archived ? '已归档 · 不会用于新记录' : '启用中 · 可用于新记录'}</span></div><div className="category-row-actions"><button className="row-action" title="编辑分类" onClick={() => onEdit(category)}><Pencil size={15} /></button>{archived ? <button className="row-action restore-action" title="恢复分类" onClick={() => onRestore(category.id)}><RotateCcw size={15} /></button> : <button className="row-action" title="归档分类" onClick={() => onArchive(category.id)}><Archive size={15} /></button>}<button className="row-action delete-action" title="删除分类" onClick={() => onDelete(category.id)}><Trash2 size={15} /></button></div></div>
}

const categoryColors = ['#E89B72', '#8BA8E8', '#C59BE8', '#74C7A1', '#E8C66E', '#E9829D', '#6DB9C8', '#A8AFBB', '#4DAA7C', '#63B5D8', '#C99A4A', '#8B7BC6']

export function CategoryModal({ editor, onClose, onSaved }: { editor: CategoryEditor; onClose: () => void; onSaved: () => Promise<void> }) {
  const [type, setType] = useState<TransactionType>(editor.category?.type ?? editor.defaultType)
  const [name, setName] = useState(editor.category?.name ?? '')
  const [color, setColor] = useState(editor.category?.color ?? categoryColors[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEditing = Boolean(editor.category)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('请输入分类名称')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (editor.category) {
        await window.easySpends.updateCategory({ id: editor.category.id, name, color })
      } else {
        await window.easySpends.createCategory({ name, type, color })
      }
      await onSaved()
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : '保存分类失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="modal-card category-modal"><div className="modal-header"><div><span className="card-kicker">CATEGORY MANAGEMENT</span><h2>{isEditing ? '编辑收支分类' : '新建收支分类'}</h2><p>{isEditing ? '分类已有记录时，不能修改收入/支出类型。' : '创建后即可在记账表单中选择。'}</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><form onSubmit={submit}>{!isEditing ? <div className="type-toggle"><button type="button" className={type === 'expense' ? 'active expense-tab' : ''} onClick={() => setType('expense')}><ArrowDownRight size={16} />支出分类</button><button type="button" className={type === 'income' ? 'active income-tab' : ''} onClick={() => setType('income')}><ArrowUpRight size={16} />收入分类</button></div> : <div className={`category-edit-type ${type}`}><span className="category-type-dot" />{type === 'expense' ? '支出分类' : '收入分类'}<small>类型不可直接修改</small></div>}<label className="category-name-field"><span>分类名称</span><input autoFocus maxLength={40} placeholder={type === 'expense' ? '例如：宠物、旅行、运动' : '例如：稿费、红包、兼职'} value={name} onChange={(event) => setName(event.target.value)} /></label><div className="color-field"><span>显示颜色</span><div className="color-options">{categoryColors.map((option) => <button type="button" key={option} className={`color-option ${color === option ? 'selected' : ''}`} aria-label={`选择颜色 ${option}`} style={{ backgroundColor: option }} onClick={() => setColor(option)} />)}</div></div>{error ? <div className="form-error">{error}</div> : null}<div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={saving}>{saving ? '保存中…' : isEditing ? '保存修改' : '创建分类'} <CheckCircle2 size={17} /></button></div></form></div></div>
}
