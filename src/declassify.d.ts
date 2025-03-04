import {
  ClassDeclaration,
  GetAccessorDeclaration,
  MethodDeclaration,
  ObjectLiteralElementLike,
  PropertyAssignment,
  PropertyDeclaration,
  SetAccessorDeclaration
} from "ts-morph";

export interface DeclassifyComponentDecorator {
  properties: ObjectLiteralElementLike[];
}

export interface DeclassifyPropWithDeclaration extends DeclassifyProp{
  declaration: PropertyDeclaration;
}

export interface DeclassifyProp {
  required?: PropertyAssignment;
  default?: PropertyAssignment;
}

export interface DeclassifyPropSyncWithDeclaration extends DeclassifyPropSync{
  declaration: PropertyDeclaration;
}

export interface DeclassifyPropSync extends DeclassifyProp {
  sync: string;
}

export interface DeclassifyWatch {
  method?: string;
  path: string;
  deep?: string;
  immediate?: string;
}

export interface DeclassifyClass {
  props: DeclassifyPropWithDeclaration[];
  syncProps: DeclassifyPropSyncWithDeclaration[];
  data: PropertyDeclaration[];
  computed: DeclassifyComputed;
  methods: MethodDeclaration[];
  watches: DeclassifyWatch[];
  vModel: DeclassifyPropWithDeclaration | null;
}

export type DeclassifyComputed = Record<string, {
  getter?: GetAccessorDeclaration
  setter?: SetAccessorDeclaration
}>;

export interface DeclassifyClassWithDeclaration extends DeclassifyClass {
  declaration: ClassDeclaration;
  decorator: DeclassifyComponentDecorator;
}
