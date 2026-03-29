'use client';

/**
 * 角色背景 Block 編輯器
 *
 * 提供「標題」與「內文」兩種 block 類型，
 * GM 可新增、刪除、拖曳排序來編排角色的背景故事。
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { GripVertical, Plus, Trash2, Type, AlignLeft } from 'lucide-react';
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

/** 單一可排序 Block 項目 */
function SortableBlock({
  block,
  onUpdate,
  onRemove,
  disabled,
}: {
  block: BlockWithId;
  onUpdate: (content: string) => void;
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
      className={`group flex items-start gap-2 rounded-lg border border-border/20 bg-card/50 p-3 transition-shadow ${
        isDragging ? 'shadow-lg opacity-80 z-10' : ''
      }`}
    >
      {/* 拖曳把手 */}
      <button
        type="button"
        className="mt-2 cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* 類型標籤 */}
      <div className="shrink-0 mt-2">
        {block.type === 'title' ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary/80">
            <Type className="h-3 w-3" />
            標題
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
            <AlignLeft className="h-3 w-3" />
            內文
          </span>
        )}
      </div>

      {/* 內容輸入 */}
      <div className="flex-1 min-w-0">
        {block.type === 'title' ? (
          <Input
            value={block.content}
            onChange={(e) => onUpdate(e.target.value)}
            disabled={disabled}
            placeholder="章節標題..."
            className="font-bold"
          />
        ) : (
          <Textarea
            value={block.content}
            onChange={(e) => onUpdate(e.target.value)}
            disabled={disabled}
            placeholder="段落內文..."
            rows={4}
            className="resize-none"
          />
        )}
      </div>

      {/* 刪除按鈕 */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0 mt-1 text-muted-foreground/40 hover:text-destructive transition-colors"
        onClick={onRemove}
        disabled={disabled}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
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
    toBlocksWithId(value)
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
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

  const addBlock = (type: 'title' | 'body') => {
    syncToParent([...blocks, { _id: generateBlockId(), type, content: '' }]);
  };

  const updateBlock = (id: string, content: string) => {
    syncToParent(
      blocks.map((b) => (b._id === id ? { ...b, content } : b))
    );
  };

  const removeBlock = (id: string) => {
    syncToParent(blocks.filter((b) => b._id !== id));
  };

  return (
    <div className="space-y-3">
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
            <div className="space-y-2">
              {blocks.map((block) => (
                <SortableBlock
                  key={block._id}
                  block={block}
                  onUpdate={(content) => updateBlock(block._id, content)}
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
          尚未新增任何背景內容，請點擊下方按鈕開始編排
        </div>
      )}

      {/* 新增按鈕 */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addBlock('title')}
          disabled={disabled}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <Type className="h-3.5 w-3.5" />
          新增標題
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addBlock('body')}
          disabled={disabled}
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <AlignLeft className="h-3.5 w-3.5" />
          新增內文
        </Button>
      </div>
    </div>
  );
}
