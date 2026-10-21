/**
 * Reference & Help Modal (八音盒使用帮助与机械结构对照)
 * Consolidates 3D navigation controls, paper strip editing guide, and physical music box specifications
 */

import React from 'react';
import { X, CheckCircle2, RotateCw, Hand, ZoomIn, Music, Wrench } from 'lucide-react';

interface ReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReferenceModal: React.FC<ReferenceModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="relative w-full max-w-3xl bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-stone-800 bg-stone-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-950/80 border border-amber-700/60 flex items-center justify-center text-amber-400">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-stone-100 font-serif">
                纸带八音盒使用帮助与机械对照
              </h3>
              <p className="text-xs text-stone-400 mt-0.5">
                3D 视角操作指南 · 纸带编辑技巧 · 实体八音盒机械规范
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
            title="关闭帮助"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-sm text-stone-300">
          {/* Section 1: 3D Viewport Controls Guide (视角操作提示已移至此处) */}
          <div className="bg-stone-950/60 p-4 rounded-xl border border-stone-800/90 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-medium text-xs">
              <RotateCw className="w-4 h-4" />
              <span>3D 场景视角导航指南</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-stone-300">
              <div className="bg-stone-900/90 p-3 rounded-lg border border-stone-800/80 space-y-1">
                <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                  <span>旋转视角</span>
                </div>
                <p className="text-stone-400 leading-relaxed text-[11px]">
                  按住鼠标<strong className="text-stone-200">左键拖拽</strong>自由旋转视角；移动端单指拖动。
                </p>
              </div>

              <div className="bg-stone-900/90 p-3 rounded-lg border border-stone-800/80 space-y-1">
                <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <Hand className="w-3.5 h-3.5 text-amber-400" />
                  <span>平移画面</span>
                </div>
                <p className="text-stone-400 leading-relaxed text-[11px]">
                  按住鼠标<strong className="text-stone-200">右键/中键</strong>拖拽，或按住 <strong className="text-stone-200">Shift+左键</strong>拖拽；移动端双指平移。
                </p>
              </div>

              <div className="bg-stone-900/90 p-3 rounded-lg border border-stone-800/80 space-y-1">
                <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <ZoomIn className="w-3.5 h-3.5 text-amber-400" />
                  <span>缩放与复位</span>
                </div>
                <p className="text-stone-400 leading-relaxed text-[11px]">
                  滑动鼠标<strong className="text-stone-200">滚轮</strong>缩放；点击 3D 顶部<strong className="text-stone-200">“复位”</strong>可快速回正。
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Paper Strip & Batch Editor */}
          <div className="bg-stone-950/60 p-4 rounded-xl border border-stone-800/90 space-y-2.5">
            <div className="flex items-center gap-2 text-amber-400 font-medium text-xs">
              <Music className="w-4 h-4" />
              <span>纸带编辑与批量选择工具</span>
            </div>
            <ul className="text-xs text-stone-400 space-y-1.5 list-disc pl-4 leading-relaxed">
              <li><strong className="text-stone-300">单点打孔/消孔：</strong>在下方的纸带工作台中，点击音符交点即可打孔或清除。</li>
              <li><strong className="text-stone-300">选择工具：</strong>切换工具栏的“选择”模式后，在纸带上拖拽框选一组音符，可通过浮动操作栏进行<strong className="text-stone-300">整体上移/下移半音、左右移动音步、或一键删除</strong>。</li>
              <li><strong className="text-stone-300">手摇曲柄互动：</strong>在 3D 视角中按住右侧黄铜手柄拖动，可顺畅带动齿轮组与加粗滚轴进纸发声。</li>
              <li><strong className="text-stone-300">1:1 实物打印：</strong>点击右上角“导出打印纸带 (SVG)”，可获得直接送往打印机裁切 Standard 70mm 卡纸的标准矢量图。</li>
            </ul>
          </div>

          {/* Section 3: Physical Mechanism Specifications */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-stone-950/60 p-4 rounded-xl border border-stone-800/90 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-medium text-xs">
                <CheckCircle2 className="w-4 h-4" />
                <span>纸带排版物理规范</span>
              </div>
              <ul className="text-xs text-stone-400 space-y-1.5 list-disc pl-4 leading-relaxed">
                <li><strong className="text-stone-300">留白边：</strong>纸带上下两侧留有标准对称空白边距。</li>
                <li><strong className="text-stone-300">中间格线：</strong>精确印刷 30 轨水平音高线与节拍小节线。</li>
                <li><strong className="text-stone-300">单一圆孔：</strong>在 MIDI 音符触发位置打物理圆孔，不受音符长短影响。</li>
              </ul>
            </div>

            <div className="bg-stone-950/60 p-4 rounded-xl border border-stone-800/90 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-medium text-xs">
                <CheckCircle2 className="w-4 h-4" />
                <span>音乐盒精密机械构造</span>
              </div>
              <ul className="text-xs text-stone-400 space-y-1.5 list-disc pl-4 leading-relaxed">
                <li><strong className="text-stone-300">下置星轮：</strong>尖齿星轮阵列置于纸带下方；未开孔处不露金属齿，开孔处齿尖才凸入孔中。</li>
                <li><strong className="text-stone-300">加宽压纸片与向上微凸：</strong>大尺寸镂空观察窗中，纸带呈现自然的向上微凸弧形张力。</li>
                <li><strong className="text-stone-300">加粗压纸轮：</strong>圆柱形白色粗滚轮紧压出纸端，带动纸带均速运动。</li>
                <li><strong className="text-stone-300">二级减速齿轮：</strong>曲柄通过精密尖齿黄铜齿轮组传动，转速自然舒缓。</li>
                <li><strong className="text-stone-300">前入后出：</strong>前面板精准进纸槽喂入，后面板出纸槽吐出。</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3 border-t border-stone-800 bg-stone-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-stone-950 font-medium text-xs rounded-lg transition-colors cursor-pointer"
          >
            返回体验
          </button>
        </div>
      </div>
    </div>
  );
};
