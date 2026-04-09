import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Zap, Users, Clock, BarChart3, DollarSign, Brain, TrendingUp,
  MessageSquare, Mail, Video, FileText, ShieldCheck, Copy, Check,
  ChevronDown, ChevronUp, Package, Briefcase,
} from "lucide-react";

const PAIN_CATEGORIES = [
  {
    id: "pessoas",
    label: "Pessoas & Turnover",
    icon: Users,
    pains: [
      "Alto turnover",
      "Baixa retenção de talentos",
      "Contratações erradas (fit comportamental inadequado)",
      "Falta de plano de desenvolvimento individual (PDI)",
      "Baixo engajamento do time",
    ],
  },
  {
    id: "recrutamento",
    label: "Recrutamento & Seleção",
    icon: Clock,
    pains: [
      "Tempo elevado de contratação (time-to-hire alto)",
      "Alto custo por contratação",
      "Baixa assertividade nos processos seletivos",
      "Excesso de retrabalho em seleção",
      "Falta de critérios objetivos para contratação",
    ],
  },
  {
    id: "performance",
    label: "Performance & Produtividade",
    icon: BarChart3,
    pains: [
      "Baixa produtividade dos times",
      "Falta de clareza de perfil ideal por função",
      "Equipes desalinhadas com as demandas do negócio",
      "Dificuldade em montar times de alta performance",
      "Baixa previsibilidade de performance",
    ],
  },
  {
    id: "custos",
    label: "Custos & Eficiência Operacional",
    icon: DollarSign,
    pains: [
      "Alto custo operacional em RH",
      "Processos manuais e pouco escaláveis",
      "Falta de dados para tomada de decisão",
      "Baixa eficiência em gestão de pessoas",
      "Desperdício de investimento em contratações erradas",
    ],
  },
  {
    id: "lideranca",
    label: "Liderança & Gestão",
    icon: Brain,
    pains: [
      "Líderes despreparados para gerir pessoas",
      "Falta de inteligência comportamental na gestão",
      "Dificuldade em dar feedbacks eficazes",
      "Conflitos internos recorrentes",
      "Falta de visão estratégica sobre o time",
    ],
  },
  {
    id: "crescimento",
    label: "Crescimento & Escala",
    icon: TrendingUp,
    pains: [
      "Crescimento desorganizado do time",
      "Dificuldade em escalar cultura",
      "Falta de padronização nos processos de pessoas",
      "Risco ao crescer sem estrutura de RH madura",
    ],
  },
];

interface GeneratedResult {
  arguments?: Array<{
    pain: string;
    solution: string;
    financialImpact: string;
    argument: string;
  }>;
  roiSimulation?: {
    summary: string;
    details: Array<{ metric: string; before: string; after: string; saving: string }>;
  };
  readyPhrases?: {
    proposal: string;
    whatsapp: string;
    email: string;
    meeting: string;
  };
  objectionHandling?: Array<{
    objection: string;
    response: string;
  }>;
  raw?: string;
}

export default function ArgumentGenerator() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Context filters
  const [segment, setSegment] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [hrMaturity, setHrMaturity] = useState("");
  const [saleType, setSaleType] = useState("");
  const [estimatedTicket, setEstimatedTicket] = useState("");
  const [audienceType, setAudienceType] = useState("rh");

  // Offer type
  const [offerType, setOfferType] = useState<"pda" | "servicos" | "ambos">("ambos");
  const [services, setServices] = useState<Array<{ id: string; name: string; description: string | null }>>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  // Pain selection
  const [selectedPains, setSelectedPains] = useState<string[]>([]);

  // Fetch services from knowledge base
  useEffect(() => {
    const fetchServices = async () => {
      const { data } = await supabase
        .from("knowledge_items")
        .select("id, name, description, item_type, category")
        .or("item_type.ilike.%servi%,item_type.ilike.%treina%,item_type.ilike.%consultoria%,item_type.ilike.%diagnos%,category.ilike.%servi%,category.ilike.%treina%")
        .order("name");
      if (data && data.length > 0) {
        setServices(data.map(d => ({ id: d.id, name: d.name, description: d.description })));
      }
    };
    fetchServices();
  }, []);

  const toggleService = (name: string) => {
    setSelectedServices(prev => prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]);
  };
  const [expandedCategories, setExpandedCategories] = useState<string[]>(PAIN_CATEGORIES.map(c => c.id));

  const togglePain = (pain: string) => {
    setSelectedPains(prev => prev.includes(pain) ? prev.filter(p => p !== pain) : [...prev, pain]);
  };

  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId]);
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleGenerate = async () => {
    if (selectedPains.length === 0) {
      toast({ title: "Selecione ao menos uma dor", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-arguments", {
        body: {
          context: { segment, companySize, hrMaturity, saleType, estimatedTicket },
          pains: selectedPains,
          audienceType,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (e: any) {
      toast({ title: "Erro ao gerar argumentos", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          Gerador de Argumentos Comerciais
        </h1>
        <p className="text-muted-foreground mt-1">
          Gere argumentos personalizados, ROI-driven, com base nas dores do cliente
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Filters */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contexto do Lead</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Segmento</Label>
                <Input placeholder="Ex: Tecnologia, Varejo..." value={segment} onChange={e => setSegment(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Nº de colaboradores</Label>
                <Input placeholder="Ex: 200" value={companySize} onChange={e => setCompanySize(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Maturidade de RH</Label>
                <Select value={hrMaturity} onValueChange={setHrMaturity}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixo">Baixo</SelectItem>
                    <SelectItem value="medio">Médio</SelectItem>
                    <SelectItem value="alto">Alto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Tipo de venda</Label>
                <Select value={saleType} onValueChange={setSaleType}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="novo">Novo cliente</SelectItem>
                    <SelectItem value="expansao">Expansão</SelectItem>
                    <SelectItem value="renovacao">Renovação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Ticket estimado</Label>
                <Input placeholder="Ex: R$ 50.000" value={estimatedTicket} onChange={e => setEstimatedTicket(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Público-alvo</Label>
                <Select value={audienceType} onValueChange={setAudienceType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="c-level">C-Level / Decisores</SelectItem>
                    <SelectItem value="rh">RH</SelectItem>
                    <SelectItem value="gestores">Gestores Operacionais</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Dores do Cliente</CardTitle>
              <CardDescription className="text-xs">Selecione as dores identificadas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
              {PAIN_CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const expanded = expandedCategories.includes(cat.id);
                const selectedCount = cat.pains.filter(p => selectedPains.includes(p)).length;
                return (
                  <div key={cat.id}>
                    <button
                      onClick={() => toggleCategory(cat.id)}
                      className="flex items-center justify-between w-full text-left py-1.5 px-2 rounded hover:bg-accent/50 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Icon className="h-3.5 w-3.5 text-primary" />
                        {cat.label}
                        {selectedCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{selectedCount}</Badge>
                        )}
                      </span>
                      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    {expanded && (
                      <div className="ml-6 space-y-1 mt-1">
                        {cat.pains.map(pain => (
                          <button
                            key={pain}
                            onClick={() => togglePain(pain)}
                            className={`w-full text-left text-xs py-1.5 px-2 rounded transition-all ${
                              selectedPains.includes(pain)
                                ? "bg-primary/20 text-primary border border-primary/30"
                                : "hover:bg-accent/30 text-muted-foreground"
                            }`}
                          >
                            {pain}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Button onClick={handleGenerate} disabled={loading || selectedPains.length === 0} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
            {loading ? "Gerando argumentos..." : `Gerar Argumentos (${selectedPains.length} dores)`}
          </Button>
        </div>

        {/* RIGHT: Results */}
        <div className="lg:col-span-2">
          {!result && !loading && (
            <Card className="glass-card h-full flex items-center justify-center min-h-[400px]">
              <div className="text-center space-y-3 p-8">
                <Zap className="h-12 w-12 text-primary/30 mx-auto" />
                <p className="text-muted-foreground text-sm">
                  Selecione as dores do cliente e clique em <strong>Gerar Argumentos</strong> para criar argumentos comerciais personalizados.
                </p>
              </div>
            </Card>
          )}

          {loading && (
            <Card className="glass-card h-full flex items-center justify-center min-h-[400px]">
              <div className="text-center space-y-3">
                <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto" />
                <p className="text-muted-foreground text-sm">Analisando base de conhecimento e gerando argumentos...</p>
              </div>
            </Card>
          )}

          {result && (
            <Tabs defaultValue="arguments" className="space-y-4">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="arguments" className="text-xs">Argumentos</TabsTrigger>
                <TabsTrigger value="roi" className="text-xs">ROI</TabsTrigger>
                <TabsTrigger value="phrases" className="text-xs">Frases</TabsTrigger>
                <TabsTrigger value="objections" className="text-xs">Objeções</TabsTrigger>
              </TabsList>

              <TabsContent value="arguments" className="space-y-3">
                {result.arguments?.map((arg, i) => (
                  <Card key={i} className="glass-card card-hover-glow">
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">{arg.pain}</Badge>
                        <button onClick={() => copyToClipboard(arg.argument, `arg-${i}`)} className="text-muted-foreground hover:text-foreground">
                          {copiedField === `arg-${i}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{arg.argument}</p>
                      <div className="flex gap-4 text-xs text-muted-foreground pt-1 border-t border-border/30">
                        <span><strong className="text-primary">Solução:</strong> {arg.solution}</span>
                      </div>
                      <p className="text-xs text-primary/80 font-medium">💰 {arg.financialImpact}</p>
                    </CardContent>
                  </Card>
                )) || <p className="text-muted-foreground text-sm">Nenhum argumento gerado.</p>}
              </TabsContent>

              <TabsContent value="roi">
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-primary" />
                      Simulação de ROI
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {result.roiSimulation ? (
                      <>
                        <p className="text-sm text-foreground">{result.roiSimulation.summary}</p>
                        <div className="space-y-2">
                          {result.roiSimulation.details?.map((d, i) => (
                            <div key={i} className="grid grid-cols-4 gap-2 text-xs p-2 rounded bg-accent/20">
                              <span className="font-medium text-foreground">{d.metric}</span>
                              <span className="text-muted-foreground">Antes: {d.before}</span>
                              <span className="text-primary">Depois: {d.after}</span>
                              <span className="text-green-400 font-medium">{d.saving}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : <p className="text-muted-foreground text-sm">Simulação não disponível.</p>}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="phrases" className="space-y-3">
                {result.readyPhrases ? (
                  <>
                    {[
                      { key: "proposal", label: "Proposta Comercial", icon: FileText },
                      { key: "whatsapp", label: "WhatsApp", icon: MessageSquare },
                      { key: "email", label: "E-mail", icon: Mail },
                      { key: "meeting", label: "Reunião ao Vivo", icon: Video },
                    ].map(({ key, label, icon: Icon }) => {
                      const text = (result.readyPhrases as any)?.[key];
                      if (!text) return null;
                      return (
                        <Card key={key} className="glass-card card-hover-glow">
                          <CardContent className="pt-4">
                            <div className="flex items-start justify-between mb-2">
                              <span className="flex items-center gap-2 text-xs font-medium text-primary">
                                <Icon className="h-3.5 w-3.5" /> {label}
                              </span>
                              <button onClick={() => copyToClipboard(text, key)} className="text-muted-foreground hover:text-foreground">
                                {copiedField === key ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                            <p className="text-sm text-foreground leading-relaxed">{text}</p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </>
                ) : <p className="text-muted-foreground text-sm">Frases não disponíveis.</p>}
              </TabsContent>

              <TabsContent value="objections" className="space-y-3">
                {result.objectionHandling?.map((obj, i) => (
                  <Card key={i} className="glass-card card-hover-glow">
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <Badge variant="outline" className="border-destructive/50 text-destructive text-[10px]">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          {obj.objection}
                        </Badge>
                        <button onClick={() => copyToClipboard(obj.response, `obj-${i}`)} className="text-muted-foreground hover:text-foreground">
                          {copiedField === `obj-${i}` ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{obj.response}</p>
                    </CardContent>
                  </Card>
                )) || <p className="text-muted-foreground text-sm">Nenhuma objeção mapeada.</p>}
              </TabsContent>
            </Tabs>
          )}

          {result?.raw && !result.arguments && (
            <Card className="glass-card mt-4">
              <CardContent className="pt-4">
                <p className="text-sm text-foreground whitespace-pre-wrap">{result.raw}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
