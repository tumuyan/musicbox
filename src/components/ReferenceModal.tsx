/**
 * Reference Comparison Modal
 * Displays visual reference and physical mechanical specifications
 */

import React from 'react';
import { X, CheckCircle2 } from 'lucide-react';

interface ReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReferenceModal: React.FC<ReferenceModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/60">
          <div>
            <h3 className="text-base font-semibold text-stone-100 font-serif">
              实体纸带八音盒机械结构对照
            </h3>
            <p className="text-xs text-stone-400 mt-0.5">
              参考附图设计细节与物理机械规格
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-stone-300">
          {/* Key Design Points aligned with Prompt */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-stone-950/50 p-4 rounded-xl border border-stone-800 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>纸带排版规范</span>
              </div>
              <ul className="text-xs text-stone-400 space-y-1.5 list-disc pl-4">
                <li><strong className="text-stone-300">留白边：</strong>纸带上下各留有标准空白边距（留白边）。</li>
                <li><strong className="text-stone-300">中间格线：</strong>中间绘制水平音高线与垂直节拍/小节线。</li>
                <li><strong className="text-stone-300">单一圆孔：</strong>在midi note对应位置打圆孔，无论音符长短都打一个圆孔。</li>
              </ul>
            </div>

            <div className="bg-stone-950/50 p-4 rounded-xl border border-stone-800 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>音乐盒精密机械构造</span>
              </div>
              <ul className="text-xs text-stone-400 space-y-1.5 list-disc pl-4">
                <li><strong className="text-stone-300">下置音梳：</strong>音齿拨簧结构位于纸带下方，星轮尖部向上贴合纸带圆孔。</li>
                <li><strong className="text-stone-300">上置薄金属压纸片：</strong>纸带上方配有薄弹簧压纸片与滚花固定螺母，保持纸带平整贴合。</li>
                <li><strong className="text-stone-300">加粗压纸轮：</strong>圆柱形加粗白色滚轴紧压纸带上方，带动进纸。</li>
                <li><strong className="text-stone-300">齿轮传动系统：</strong>侧面手摇曲柄经由三级黄铜齿轮啮合传动，驱动加粗压纸轮旋转拉动纸带。</li>
                <li><strong className="text-stone-300">前入后出：</strong>前面板开孔进纸，后面板开孔出纸，纸带处于槽心高度。</li>
              </ul>
            </div>
          </div>

          {/* Interactive tips */}
          <div className="bg-amber-950/20 border border-amber-900/40 p-4 rounded-xl text-xs text-amber-200/90 space-y-1.5">
            <div className="font-semibold text-amber-300">操作指南与特色：</div>
            <p>1. <strong>3D机械视角：</strong>可点击左上角的“参考原图视角”，完全复现附图中的俯视透视角度；按住鼠标左键可任意360度旋转视角，滚轮可缩放。</p>
            <p>2. <strong>手摇曲柄：</strong>右下角的黄铜曲柄支持按住鼠标手动旋转，体验真实机械八音盒的声学生成。</p>
            <p>3. <strong>纸带编辑器：</strong>点击下方纸带格线上的交叉点即可任意打孔或消孔；支持一键导出标准70mm比例可打印矢量图 (SVG)及MIDI文件。</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-800 bg-stone-950/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-stone-950 font-medium text-xs rounded-lg transition-colors"
          >
            返回体验
          </button>
        </div>
      </div>
    </div>
  );
};
