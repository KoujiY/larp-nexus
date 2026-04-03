'use client';

/**
 * 背景 Block 編輯器（v2）
 *
 * 提供「標題」與「內文」兩種 block 類型，
 * GM 可新增、刪除、拖曳排序、切換類型來編排內容。
 *
 * v2 變更：
 * - Block 樣式：p-6 rounded-xl，bg-muted/30 hover:bg-muted/50
 * - 類型切換：pill toggle（標題/內文）取代靜態標籤
 * - 刪除按鈕：hover 才顯示（opacity-0 → group-hover:opacity-100）
 * - 單一「新增區塊」按鈕（虛線框），預設新增「內文」
 */

import { useState, useId } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { GripVertical, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashedAddButton } from '@/components/gm/dashed-add-button';
import type { BackgroundBlock } from '@/types/character';

interface BackgroundBlockEditorProps {
  value: BackgroundBlock[];
  onChange: (blocks: BackgroundBlock[]) => void;
  disabled?: boolean;
}

/** 內部用 block 附加唯一 ID（dnd-kit 需要） */
interface BlockWithId extends BackgroundBlock {
  _id: string;
}

function generateBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toBlocksWithId(blocks: BackgroundBlock[]): BlockWithId[] {
  return blocks.map((b) => ({ ...b, _id: generateBlockId() }));
}

function fromBlocksWithId(blocks: BlockWithId[]): BackgroundBlock[] {
  return blocks.map(({ type, content }) => ({ type, content }));
}

/** Pill-shaped 類型切換 toggle */
function BlockTypeToggle({
  type,
  onChange,
  disabled,
}: {
  type: 'title' | 'body';
  onChange: (type: 'title' | 'body') => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex bg-muted rounded-full p-0.5 select-none cursor-pointer">
      <button
        type="button"
        onClick={() => onChange('title')}
        disabled={disabled}
        className={cn(
          'px-3 py-1 text-[11px] font-extrabold rounded-full transition-all cursor-pointer',
          type === 'title'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        標題
      </button>
      <button
        type="button"
        onClick={() => onChange('body')}
        disabled={disabled}
        className={cn(
          'px-3 py-1 text-[11px] font-extrabold rounded-full transition-all cursor-pointer',
          type === 'body'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        內文
      </button>
    </div>
  );
}

/** 單一可排序 Block 項目 */
function SortableBlock({
  block,
  onUpdate,
  onTypeChange,
  onRemove,
  disabled,
}: {
  block: BlockWithId;
  onUpdate: (content: string) => void;
  onTypeChange: (type: 'title' | 'body') => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative bg-muted/30 hover:bg-muted/50 p-6 rounded-xl transition-all duration-200',
        isDragging && 'shadow-lg opacity-80 z-10',
      )}
    >
      {/* 上方工具列：拖曳把手 + 類型 toggle + 刪除 */}
      <div className="flex items-center gap-4 mb-4">
        <button
          type="button"
          className="cursor-grab text-muted-foreground/30 hover:text-muted-foreground active:cursor-grabbing transition-colors"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>

        <BlockTypeToggle
          type={block.type}
          onChange={onTypeChange}
          disabled={disabled}
        />

        <div className="flex-1" />

        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="text-muted-foreground/40 hover:text-destructive transition-colors cursor-pointer"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      {/* 內容輸入 */}
      {block.type === 'title' ? (
        <Input
          value={block.content}
          onChange={(e) => onUpdate(e.target.value)}
          disabled={disabled}
          placeholder="章節標題..."
          className="w-full bg-transparent border-0 font-bold text-lg p-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      ) : (
        <Textarea
          value={block.content}
          onChange={(e) => onUpdate(e.target.value)}
          disabled={disabled}
          placeholder="段落內文..."
          rows={4}
          className="w-full bg-transparent border-0 text-sm text-muted-foreground leading-relaxed p-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 resize-none"
        />
      )}
    </div>
  );
}

export function BackgroundBlockEditor({
  value,
  onChange,
  disabled,
}: BackgroundBlockEditorProps) {
  const dndId = useId();
  const [blocks, setBlocks] = useState<BlockWithId[]>(() =>
    toBlocksWithId(value),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  /** 同步到父元件 */
  const syncToParent = (updated: BlockWithId[]) => {
    setBlocks(updated);
    onChange(fromBlocksWithId(updated));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = blocks.findIndex((b) => b._id === active.id);
    const newIndex = blocks.findIndex((b) => b._id === over.id);
    syncToParent(arrayMove(blocks, oldIndex, newIndex));
  };

  const addBlock = () => {
    syncToParent([...blocks, { _id: generateBlockId(), type: 'body', content: '' }]);
  };

  const updateBlock = (id: string, content: string) => {
    syncToParent(
      blocks.map((b) => (b._id === id ? { ...b, content } : b)),
    );
  };

  const changeBlockType = (id: string, type: 'title' | 'body') => {
    syncToParent(
      blocks.map((b) => (b._id === id ? { ...b, type } : b)),
    );
  };

  const removeBlock = (id: string) => {
    syncToParent(blocks.filter((b) => b._id !== id));
  };

  return (
    <div className="space-y-6">
      {blocks.length > 0 && (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={blocks.map((b) => b._id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-6">
              {blocks.map((block) => (
                <SortableBlock
                  key={block._id}
                  block={block}
                  onUpdate={(content) => updateBlock(block._id, content)}
                  onTypeChange={(type) => changeBlockType(block._id, type)}
                  onRemove={() => removeBlock(block._id)}
                  disabled={disabled}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {blocks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground/50 text-sm">
          尚未新增任何內容，請點擊下方按鈕開始編排
        </div>
      )}

      {/* 新增區塊按鈕（單一按鈕，預設新增「內文」） */}
      <DashedAddButton
        label="新增區塊"
        onClick={addBlock}
        disabled={disabled}
        className="py-5"
      />
    </div>
  );
}
