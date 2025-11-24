import React, { useState, useRef } from 'react';
import { Upload, Sparkles, Settings, ChevronRight, Check, Loader2, Plus, X } from 'lucide-react';
import { Persona, UESReport, UserRole } from './types';
import { analyzeDesign } from './services/geminiService';
import { ReportView } from './components/ReportView';

// --- Constants ---
const DEFAULT_PERSONAS: Persona[] = [
  {
    id: '1',
    name: '银发新手用户',
    role: UserRole.USER,
    description: '模拟科技素养较低且可能存在视力障碍的用户。',
    attributes: {
      age: '65岁以上',
      techSavviness: '低',
      domainKnowledge: '新手',
      goals: '无错误地完成基本任务',
      environment: '安静的家庭环境',
      frustrationTolerance: '低',
      deviceHabits: '使用大字体，操作缓慢'
    }
  },
  {
    id: '2',
    name: '极客效率用户',
    role: UserRole.USER,
    description: '追求极致效率，熟知快捷键的专家级用户。',
    attributes: {
      age: '25-35岁',
      techSavviness: '高',
      domainKnowledge: '专家',
      goals: '最快速度完成任务',
      environment: '繁忙的办公室',
      frustrationTolerance: '中',
      deviceHabits: '重度键盘使用者，多屏操作'
    }
  },
  {
    id: '3',
    name: 'UX 专家审计',
    role: UserRole.EXPERT,
    description: '基于启发式原则和设计系统一致性进行专业评估。',
    attributes: {
      age: '30-40岁',
      techSavviness: '高',
      domainKnowledge: '专家',
      goals: '确保设计系统一致性和规范性',
      environment: '设计工作室',
      frustrationTolerance: '高',
      deviceHabits: '像素级审查'
    }
  }
];

const EMPTY_PERSONA: Omit<Persona, 'id'> = {
  name: '',
  role: UserRole.USER,
  description: '',
  attributes: {
    age: '',
    techSavviness: '中',
    domainKnowledge: '新手',
    goals: '',
    environment: '普通室内环境',
    frustrationTolerance: '中',
    deviceHabits: '手机/电脑混合使用'
  }
};

// --- Main App Component ---
export default function App() {
  const [personas, setPersonas] = useState<Persona[]>(DEFAULT_PERSONAS);
  const [selectedPersona, setSelectedPersona] = useState<Persona>(DEFAULT_PERSONAS[0]);
  const [image, setImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [report, setReport] = useState<UESReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPersonaData, setNewPersonaData] = useState<Omit<Persona, 'id'>>(EMPTY_PERSONA);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset report if image or persona changes significantly (optional, usually better to keep until re-analyze)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setReport(null); // Reset report on new image
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!image) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeDesign(image, selectedPersona);
      setReport(result);
    } catch (err) {
      setError("分析失败。请检查您的 API Key 或尝试其他图片。");
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreatePersona = () => {
    if (!newPersonaData.name) return;
    
    const newPersona: Persona = {
      ...newPersonaData,
      id: Date.now().toString(),
    };
    
    setPersonas(prev => [...prev, newPersona]);
    setSelectedPersona(newPersona);
    setIsModalOpen(false);
    setNewPersonaData(EMPTY_PERSONA);
  };

  const updateNewPersonaAttr = (field: keyof typeof EMPTY_PERSONA.attributes, value: string) => {
    setNewPersonaData(prev => ({
      ...prev,
      attributes: {
        ...prev.attributes,
        [field]: value
      }
    }));
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 font-sans text-slate-900">
      
      {/* Sidebar / Configuration Panel */}
      <div className="w-full md:w-96 bg-white border-r border-slate-200 h-auto md:h-screen flex flex-col sticky top-0 z-20 overflow-y-auto">
        
        {/* Brand */}
        <div className="p-6 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <Sparkles size={24} fill="currentColor" className="text-indigo-500" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900">UES Agent</h1>
          </div>
          <p className="text-xs text-slate-500 font-medium">产品体验自动化分析工具</p>
        </div>

        {/* Step 1: Upload */}
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">1</span>
            上传设计图
          </h2>
          
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all relative group ${image ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'}`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange} 
            />
            
            {image ? (
              <div className="relative">
                <img src={image} alt="Preview" className="w-full h-40 object-contain rounded-md mb-2" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors rounded-md">
                  <p className="text-white opacity-0 group-hover:opacity-100 text-xs font-bold bg-black/50 px-3 py-1 rounded-full">更换图片</p>
                </div>
                <p className="text-xs text-indigo-600 font-medium mt-2 flex items-center justify-center gap-1">
                  <Check size={12} /> 图片已加载
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center py-4 text-slate-400">
                <Upload size={32} className="mb-2" />
                <p className="text-sm font-medium text-slate-600">点击上传 UI 界面</p>
                <p className="text-xs">支持 PNG, JPG, WebP</p>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Persona */}
        <div className="p-6 border-b border-slate-100 flex-1">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">2</span>
              选择测评角色
            </h2>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 bg-indigo-50 rounded-md transition-colors"
            >
              <Plus size={14} />
              新建
            </button>
          </div>
          
          <div className="space-y-3">
            {personas.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPersona(p)}
                className={`w-full text-left p-3 rounded-lg border transition-all relative ${selectedPersona.id === p.id ? 'border-indigo-500 bg-indigo-50 shadow-sm ring-1 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300 bg-white'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-slate-800">{p.name}</span>
                  {p.role === UserRole.EXPERT && <span className="text-[10px] bg-slate-800 text-white px-1.5 py-0.5 rounded">专家</span>}
                </div>
                <p className="text-xs text-slate-500 line-clamp-2 mb-2">{p.description}</p>
                
                {/* Mini attributes visualization */}
                <div className="flex gap-1 flex-wrap">
                   <span className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500">
                    {p.attributes.techSavviness} 科技感
                   </span>
                   <span className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500">
                    {p.attributes.age}
                   </span>
                </div>

                {selectedPersona.id === p.id && (
                  <div className="absolute top-3 right-3">
                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Selected Persona Details (Collapsible-ish info) */}
          <div className="mt-6 bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs">
            <h3 className="font-bold text-slate-700 mb-2 flex items-center gap-1">
              <Settings size={12} /> 
              当前配置
            </h3>
            <ul className="space-y-1 text-slate-500">
              <li className="flex justify-between"><span>目标:</span> <span className="font-medium text-right truncate ml-2">{selectedPersona.attributes.goals}</span></li>
              <li className="flex justify-between"><span>环境:</span> <span className="font-medium text-right">{selectedPersona.attributes.environment}</span></li>
              <li className="flex justify-between"><span>容忍度:</span> <span className="font-medium text-right">{selectedPersona.attributes.frustrationTolerance}</span></li>
            </ul>
          </div>
        </div>

        {/* Action Button */}
        <div className="p-6 bg-white sticky bottom-0 border-t border-slate-200 z-10">
          <button
            onClick={handleAnalyze}
            disabled={!image || isAnalyzing}
            className={`w-full py-3 px-4 rounded-xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
              !image || isAnalyzing 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-200'
            }`}
          >
            {isAnalyzing ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                体验分析中...
              </>
            ) : (
              <>
                开始 UES 评估
                <ChevronRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content Area - Reports */}
      <div className="flex-1 overflow-auto h-screen bg-slate-50 p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          
          {/* Empty State */}
          {!report && !isAnalyzing && !error && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6 mt-20 opacity-60">
              <div className="w-32 h-32 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                <Sparkles size={48} className="text-indigo-300" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">准备就绪</h2>
              <p className="text-slate-500 max-w-md">
                请在左侧上传设计截图并选择测评角色，生成深度 UES 体验报告。
              </p>
              
              {/* Fake feature list for aesthetics */}
              <div className="grid grid-cols-3 gap-4 w-full max-w-lg mt-8">
                <div className="p-4 bg-white rounded-lg shadow-sm border border-slate-100">
                  <div className="h-2 w-12 bg-indigo-100 rounded mb-2"></div>
                  <div className="h-2 w-20 bg-slate-100 rounded"></div>
                </div>
                 <div className="p-4 bg-white rounded-lg shadow-sm border border-slate-100">
                  <div className="h-2 w-12 bg-emerald-100 rounded mb-2"></div>
                  <div className="h-2 w-20 bg-slate-100 rounded"></div>
                </div>
                 <div className="p-4 bg-white rounded-lg shadow-sm border border-slate-100">
                  <div className="h-2 w-12 bg-orange-100 rounded mb-2"></div>
                  <div className="h-2 w-20 bg-slate-100 rounded"></div>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isAnalyzing && (
             <div className="flex flex-col items-center justify-center h-[60vh] space-y-6">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                  <div className="absolute top-0 left-0 w-16 h-16 flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold text-slate-800">正在模拟 {selectedPersona.name}...</h3>
                  <p className="text-sm text-slate-500">正在分析启发式原则、对比度与设计一致性。</p>
                </div>
             </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-lg text-red-700 text-sm text-center mt-10">
              {error}
            </div>
          )}

          {/* Report View */}
          {report && !isAnalyzing && (
            <ReportView report={report} />
          )}

        </div>
      </div>

      {/* Create Persona Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden relative flex flex-col z-10 animate-fade-in">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-500" />
                创建自定义角色
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Basic Info */}
                <div className="md:col-span-2 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">角色名称 <span className="text-red-500">*</span></label>
                        <input 
                          type="text" 
                          value={newPersonaData.name}
                          onChange={(e) => setNewPersonaData({...newPersonaData, name: e.target.value})}
                          placeholder="例如：年轻的游戏玩家"
                          className="w-full rounded-lg border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm py-2 px-3 border"
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">测评类型</label>
                        <select 
                          value={newPersonaData.role}
                          onChange={(e) => setNewPersonaData({...newPersonaData, role: e.target.value as UserRole})}
                          className="w-full rounded-lg border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm py-2 px-3 border bg-white"
                        >
                          <option value={UserRole.USER}>普通用户 (User)</option>
                          <option value={UserRole.EXPERT}>专家 (Expert)</option>
                        </select>
                     </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">角色描述</label>
                    <textarea 
                      value={newPersonaData.description}
                      onChange={(e) => setNewPersonaData({...newPersonaData, description: e.target.value})}
                      placeholder="简要描述该角色的背景和特点..."
                      className="w-full rounded-lg border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm py-2 px-3 border h-20 resize-none"
                    />
                  </div>
                </div>

                <div className="md:col-span-2 py-2">
                  <div className="h-px bg-slate-100"></div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-2 block">详细属性配置</span>
                </div>

                {/* Attributes - Left Column */}
                <div className="space-y-4">
                   <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">年龄段</label>
                      <input 
                        type="text" 
                        value={newPersonaData.attributes.age}
                        onChange={(e) => updateNewPersonaAttr('age', e.target.value)}
                        placeholder="例如：25-30岁"
                        className="w-full rounded-lg border-slate-200 focus:border-indigo-500 text-sm py-2 px-3 border"
                      />
                   </div>
                   <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">科技熟练度</label>
                       <select 
                          value={newPersonaData.attributes.techSavviness}
                          onChange={(e) => updateNewPersonaAttr('techSavviness', e.target.value)}
                          className="w-full rounded-lg border-slate-200 focus:border-indigo-500 text-sm py-2 px-3 border bg-white"
                        >
                          <option value="低">低 (小白)</option>
                          <option value="中">中 (普通)</option>
                          <option value="高">高 (极客)</option>
                        </select>
                   </div>
                   <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">领域知识</label>
                      <input 
                        type="text" 
                        value={newPersonaData.attributes.domainKnowledge}
                        onChange={(e) => updateNewPersonaAttr('domainKnowledge', e.target.value)}
                        placeholder="例如：新手 / 专家"
                        className="w-full rounded-lg border-slate-200 focus:border-indigo-500 text-sm py-2 px-3 border"
                      />
                   </div>
                   <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">设备习惯</label>
                      <input 
                        type="text" 
                        value={newPersonaData.attributes.deviceHabits}
                        onChange={(e) => updateNewPersonaAttr('deviceHabits', e.target.value)}
                        placeholder="例如：单手操作手机"
                        className="w-full rounded-lg border-slate-200 focus:border-indigo-500 text-sm py-2 px-3 border"
                      />
                   </div>
                </div>

                {/* Attributes - Right Column */}
                <div className="space-y-4">
                   <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">核心目标</label>
                      <input 
                        type="text" 
                        value={newPersonaData.attributes.goals}
                        onChange={(e) => updateNewPersonaAttr('goals', e.target.value)}
                        placeholder="例如：快速完成支付"
                        className="w-full rounded-lg border-slate-200 focus:border-indigo-500 text-sm py-2 px-3 border"
                      />
                   </div>
                   <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">使用环境</label>
                      <input 
                        type="text" 
                        value={newPersonaData.attributes.environment}
                        onChange={(e) => updateNewPersonaAttr('environment', e.target.value)}
                        placeholder="例如：嘈杂的地铁"
                        className="w-full rounded-lg border-slate-200 focus:border-indigo-500 text-sm py-2 px-3 border"
                      />
                   </div>
                   <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">挫折容忍度</label>
                       <select 
                          value={newPersonaData.attributes.frustrationTolerance}
                          onChange={(e) => updateNewPersonaAttr('frustrationTolerance', e.target.value)}
                          className="w-full rounded-lg border-slate-200 focus:border-indigo-500 text-sm py-2 px-3 border bg-white"
                        >
                          <option value="低">低 (容易放弃)</option>
                          <option value="中">中 (愿意尝试)</option>
                          <option value="高">高 (极有耐心)</option>
                        </select>
                   </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleCreatePersona}
                disabled={!newPersonaData.name}
                className={`px-4 py-2 text-sm font-bold text-white rounded-lg shadow-sm transition-all ${!newPersonaData.name ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                保存角色
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}