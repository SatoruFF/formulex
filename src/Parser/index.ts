// TODO: Refactor errors to use the error class from the lib/exceptions
import Token from '../Lexer/Token';
import TokenType, {
  tokenTypesBinOperations,
  tokenTypesBoolean,
  tokenTypesList,
  tokenTypesUnarOperations,
} from '../Lexer/TokenType';

import BinOperationNode from '../AST/BinOperationNode';
import ExpressionNode from '../AST/ExpressionNode';
import FunctionNode from '../AST/FunctionNode';
import LiteralNode from '../AST/LiteralNode';
import NumberNode from '../AST/NumberNode';
import ParenthesizedNode from '../AST/ParenthesizedNode';
import StatementsNode from '../AST/StatementsNode';
import VariableNode from '../AST/VariableNode';
import UnarOperationNode from '../AST/UnarOperationNode';
import IfStatementNode from '../AST/IfStatementNode';
import BooleanNode from '../AST/BooleanNode';
import NullNode from '../AST/NullNode';

import { allFunctions } from './mappers/functions';
import { isSafeFunction, ValidFunctionsNames } from './mappers/functions/types';
import { allUnarOperators } from './mappers/unarOperators';
import { ValidUnarOperatorsNames } from './mappers/unarOperators/types';
import { ifStatementMap } from './mappers/if';
import { allBinOperators } from './mappers/binOperators';
import {
  isSafeOperator,
  ValidBinOperatorsNames,
} from './mappers/binOperators/types';

import { FORMATS } from '../constants/formats';
import { UNKNOWN_NODE_TYPE } from '../constants/nodeTypes';
import { IVar } from '../main';
import { removePrefixSuffix } from '../lib/removePrefixSuffix';
import { FORMULA_TEMPLATES } from '../constants/templates';
import { typesMapper } from '../constants/typesMapper';
import { operatorPrecedence } from '../constants/operatorPrecedence';
import { defaultValues } from '../constants/defaultValues';

type ParserVar = IVar;

type INodeReturnType = [Set<string>, number?];

export default class Parser {
  tokens: Token[];
  pos: number = 0;
  variables: Record<string, ParserVar> = {};
  returnTypesCache: Record<string, INodeReturnType> = {};
  potentialErrors: string[] = [];

  constructor(tokens: Token[], variables: Record<string, ParserVar>) {
    this.tokens = tokens;
    this.variables = variables;
  }

  parseCode(): StatementsNode {
    const lastToken = this.tokens[this.tokens.length - 1];
    const statementEnd = lastToken.pos + lastToken.text.length;

    const root = new StatementsNode(statementEnd);

    while (this.pos < this.tokens.length) {
      const codeStringNode = this.parseExpression();
      // if we need make formula multiline, uncomment this string and add in tokens symbol, which mean end of line
      // this.require(END_LINE_SYMBOL)
      root.addNode(codeStringNode);
    }

    return root;
  }

  parseExpression(): ExpressionNode {
    let currentNode = this.getCurrentNode();
    let operator = this.match(...tokenTypesBinOperations);
    let rightNode;

    if (!operator) {
      return currentNode;
    }

    while (operator) {
      const precedence = operatorPrecedence[operator.token.name];
      rightNode = this.parseFormula(precedence);
      currentNode = new BinOperationNode(operator, currentNode, rightNode);
      operator = this.match(...tokenTypesBinOperations);
    }

    return currentNode;
  }

  getCurrentNode(): ExpressionNode {
    const parsersForPossibleResults = [
      this.parseLiteralNode,
      this.parseNumberNode,
      this.parseBooleanNode,
      this.parseNullNode,
      this.parseVariableNode,
      this.parseUnarOperatorNode,
      this.parseParenthesizedNode,
      this.parseIfStatementNode,
      this.parseFunctionNode,
    ];

    for (const parseFn of parsersForPossibleResults) {
      // with call method typescript  gets confused
      const possibleResult = parseFn.bind(this)();
      if (possibleResult !== null) {
        return possibleResult;
      }
    }

    throw new Error(`Unexpected syntax on ${this.pos}`);
  }

  parseLiteralNode(): LiteralNode | null {
    const string = this.match(tokenTypesList.get('STRING') as TokenType);
    if (string) {
      return new LiteralNode(string);
    }

    return null;
  }

  parseNumberNode(): NumberNode | null {
    const number = this.match(tokenTypesList.get('NUMBER') as TokenType);
    if (number) {
      return new NumberNode(number);
    }

    return null;
  }

  parseBooleanNode(): BooleanNode | null {
    const keyword = this.match(...tokenTypesBoolean);
    if (keyword) {
      return new BooleanNode(keyword);
    }

    return null;
  }

  parseNullNode(): NullNode | null {
    const keyword = this.match(tokenTypesList.get('NULL') as TokenType);
    if (keyword) {
      return new NullNode(keyword);
    }

    return null;
  }

  parseVariableNode(): VariableNode | null {
    const variable = this.match(tokenTypesList.get('VARIABLE') as TokenType);
    if (variable) {
      return new VariableNode(variable);
    }

    return null;
  }

  parseUnarOperatorNode(): UnarOperationNode | null {
    const unarOperator = this.match(...tokenTypesUnarOperations);
    if (unarOperator) {
      const node = this.parseFormula();
      return new UnarOperationNode(unarOperator, node);
    }

    return null;
  }

  parseParenthesizedNode(): ParenthesizedNode | null {
    const leftPar = this.match(tokenTypesList.get('LPAR') as TokenType);
    if (leftPar) {
      const node = this.parseFormula();
      this.require(tokenTypesList.get('RPAR') as TokenType);
      return new ParenthesizedNode(node);
    }

    return null;
  }

  parseIfStatementNode(): IfStatementNode | null {
    const ifStatement = this.match(tokenTypesList.get('IF') as TokenType);
    if (ifStatement) {
      const leftPar = this.match(tokenTypesList.get('LPAR') as TokenType);
      if (leftPar) {
        const isBracketsEmpty = !!this.match(
          tokenTypesList.get('RPAR') as TokenType,
        );
        if (isBracketsEmpty) {
          throw new Error(
            `An empty conditional operator at the position ${ifStatement.pos}`,
          );
        }

        const result = [];
        let currentNode = this.parseFormula();
        if (currentNode) {
          result.push(currentNode);

          let virguleCount = 0;
          let virgule = this.match(tokenTypesList.get('VIRGULE') as TokenType);
          while (virgule) {
            if (virguleCount >= 2) {
              throw new Error(
                `An unexpected number of arguments per position ${virgule.pos + 1}`,
              );
            }
            virguleCount++;
            currentNode = this.parseFormula();
            result.push(currentNode);
            virgule = this.match(tokenTypesList.get('VIRGULE') as TokenType);
          }
        }

        this.require(tokenTypesList.get('RPAR') as TokenType);
        return new IfStatementNode(
          ifStatement,
          result[0],
          result[1],
          result[2],
        );
      }
    }
    return null;
  }

  parseFunctionNode(): FunctionNode | null {
    const func = this.match(tokenTypesList.get('FUNCTION') as TokenType);
    if (func) {
      const leftPar = this.match(tokenTypesList.get('LPAR') as TokenType);
      if (leftPar) {
        const isBracketsEmpty = !!this.match(
          tokenTypesList.get('RPAR') as TokenType,
        );
        if (isBracketsEmpty) {
          return new FunctionNode(func, func.text, []);
        }
        const args = this.parseFunctionArgs();
        this.require(tokenTypesList.get('RPAR') as TokenType);
        return new FunctionNode(func, func.text, args);
      }
      throw new Error(
        `An enumeration of arguments for the position was expected ${this.pos}`,
      );
    }
    return null;
  }

  parseFunctionArgs(): ExpressionNode[] {
    const result = [];
    let currentNode = this.parseFormula();
    if (!currentNode) {
      return [];
    }

    result.push(currentNode);

    let virgule = this.match(tokenTypesList.get('VIRGULE') as TokenType);
    while (virgule) {
      currentNode = this.parseFormula();
      result.push(currentNode);
      virgule = this.match(tokenTypesList.get('VIRGULE') as TokenType);
    }

    return result;
  }

  parseFormula(minPrecedence = 0): ExpressionNode {
    let leftNode = this.getCurrentNode();
    let operator = this.match(...tokenTypesBinOperations);
    let rightNode;

    while (operator) {
      const precedence = operatorPrecedence[operator.token.name];
      if (precedence < minPrecedence) {
        this.pos -= 1;
        break;
      }

      rightNode = this.parseFormula(precedence);
      leftNode = new BinOperationNode(operator, leftNode, rightNode);
      operator = this.match(...tokenTypesBinOperations);
    }

    return leftNode;
  }

  match(...expected: TokenType[]): Token | null {
    if (this.pos < this.tokens.length) {
      const currentToken = this.tokens[this.pos];

      if (expected.find((i) => i.name === currentToken.token.name)) {
        this.pos += 1;
        return currentToken;
      }
    }

    return null;
  }

  require(...expected: TokenType[]): Token {
    const token = this.match(...expected);
    if (!token) {
      throw new Error(
        `On the position ${this.pos} expected ${expected[0].name}`,
      );
    }
    return token;
  }

  stringifyAst(
    node: ExpressionNode,
    format: (typeof FORMATS)[keyof typeof FORMATS],
    safe: boolean,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    if (node instanceof StatementsNode) {
      const withErrorsFilter =
        this.potentialErrors.length > 0 && format === FORMATS.SQL && safe;
      return node.codeStrings.map(
        (i) =>
          `${this.stringifyAst(i, format, safe)}${withErrorsFilter ? ` WHERE ${this.potentialErrors.join(' AND ')}` : ''}`,
      );
    }
    if (node instanceof NumberNode) {
      return node.number.text;
    }
    if (node instanceof LiteralNode) {
      // replace brackets around format stringify
      if (format === FORMATS.SQL) {
        return `'${node.literal.text.slice(1, -1)}'`;
      }
      return `${node.literal.text}`;
    }
    if (node instanceof BooleanNode || node instanceof NullNode) {
      return node.keyword.text;
    }
    if (node instanceof VariableNode) {
      const globalVarKey = removePrefixSuffix(node.variable.text);
      if (this.variables[globalVarKey]) {
        const preparedVar = `$$VARIABLES['${globalVarKey}']`;
        const sendedVar = this.variables[globalVarKey];
        if (format === FORMATS.JS) {
          return `(${preparedVar} === null ? ${defaultValues[sendedVar.type] ?? ''}: ${preparedVar})`;
        } else {
          return `COALESCE($$VARIABLES['${globalVarKey}'], ${defaultValues[sendedVar.type] ?? ''})`;
        }
      }
      throw new Error(
        `Invalid variable ${node.variable.text} on the position ${node.start}`,
      );
    }
    if (node instanceof ParenthesizedNode) {
      return `(${this.stringifyAst(node.expression, format, safe)})`;
    }
    if (node instanceof UnarOperationNode) {
      const operator =
        allUnarOperators[node.operator.token.name as ValidUnarOperatorsNames];
      const operand = this.stringifyAst(node.operand, format, safe);

      if (operator.types.length === 0) {
        return operator[`${format}Fn`](operand);
      }

      let isOperandValid = false;
      const [operatorType] = this.getReturnType(node);
      operatorType.forEach((i) => {
        if (operator.types.find((j) => j === i)) {
          isOperandValid = true;
        }
      });

      if (isOperandValid) {
        return operator[`${format}Fn`](operand);
      }

      throw new Error(
        `Unexpected type of data when ${node.operator.text} on the position ${node.operand.start}`,
      );
    }
    if (node instanceof BinOperationNode) {
      const operator =
        allBinOperators[node.operator.token.name as ValidBinOperatorsNames];
      const [operatorType, index] = this.getReturnType(node);

      const leftNode = this.stringifyAst(node.left, format, safe);
      const rightNode = this.stringifyAst(node.right, format, safe);

      // Maybe change logic for show correct error position
      if (operatorType.has(UNKNOWN_NODE_TYPE)) {
        throw new Error(
          `Unexpected type of data when ${node.operator.text} on the position ${node.operator.pos}`,
        );
      }

      if (index !== undefined) {
        const neededOperator = operator[index];

        if (isSafeOperator(neededOperator) && safe) {
          const safeFn = neededOperator[`${format}SafeFn`];

          if (format === FORMATS.SQL) {
            this.potentialErrors.push(
              neededOperator.filterError(leftNode, rightNode),
            );
          }

          return safeFn(leftNode, rightNode);
        } else {
          return neededOperator[`${format}Fn`](leftNode, rightNode);
        }
      }

      throw new Error(
        `Unexpected type of data when ${node.operator.text} on the position ${node.operator.pos}`,
      );
    }
    if (node instanceof IfStatementNode) {
      const test = this.stringifyAst(node.test, format, safe);
      const consequent = this.stringifyAst(node.consequent, format, safe);
      const alternate = this.stringifyAst(node.alternate, format, safe);

      return ifStatementMap[`${format}Fn`](test, consequent, alternate);
    }
    if (node instanceof FunctionNode) {
      // may use as, because next stroke check valid func
      const currentFunction = allFunctions[node.name as ValidFunctionsNames];
      if (currentFunction) {
        const [nodeReturnType, idx] = this.getReturnType(node);

        if (nodeReturnType.has(UNKNOWN_NODE_TYPE)) {
          throw new Error(
            `Unexpected data type in the function ${node.name} on the position ${node.func.pos}`,
          );
        }

        if (idx === undefined) {
          throw new Error('');
        }

        const functionArgs = node.args.map((arg) => {
          const argNode = this.stringifyAst(arg, format, safe);
          return argNode;
        });

        const neededFunc = currentFunction[idx];
        if (isSafeFunction(neededFunc) && safe) {
          const safeFn = neededFunc[`${format}SafeFn`];
          if (format === FORMATS.SQL) {
            this.potentialErrors.push(neededFunc.filterError(functionArgs));
          }

          return safeFn(functionArgs);
        } else {
          return neededFunc[`${format}Fn`](functionArgs);
        }
      }
      throw new Error(
        `Invalid function name ${node.name} on the position ${node.func.pos}`,
      );
    }
    throw new Error(`Invalid syntax in the position ${node.start}`);
  }

  // TODO: this func need refactor, in every condition block we repeat code: setReturnType, return res ...
  // return all possible return types
  // for binary operator and funcs operators we return index which founds coincidence
  getReturnType(node: ExpressionNode): [Set<string>, number?] {
    const typeFromCache = this.getCachedReturnType(node.start, node.end);
    if (typeFromCache) {
      return typeFromCache;
    }
    if (
      node instanceof NumberNode ||
      node instanceof LiteralNode ||
      node instanceof BooleanNode ||
      node instanceof NullNode
    ) {
      return [new Set([node.type])];
    }
    if (node instanceof VariableNode) {
      const globalVarKey = removePrefixSuffix(node.variable.text);
      // some variables we need to prevent for some knowing types, like progress, stars and etc.
      let variableType = this.variables[globalVarKey]?.type;

      variableType =
        typesMapper[variableType as keyof typeof typesMapper] || variableType;

      if (variableType) {
        return [new Set([variableType])];
      }
      return [new Set([UNKNOWN_NODE_TYPE])];
    }
    if (node instanceof ParenthesizedNode) {
      const res = this.getReturnType(node.expression);
      this.setReturnTypeInCache(res, node.start, node.end);
      return res;
    }
    if (node instanceof UnarOperationNode) {
      const res = this.getReturnType(node.operand);
      this.setReturnTypeInCache(res, node.start, node.end);
      return res;
    }
    // For binary operator and funcs always returns [Set(...), idx]
    if (node instanceof BinOperationNode) {
      const operator =
        allBinOperators[node.operator.token.name as ValidBinOperatorsNames];

      if (!operator) {
        const res: INodeReturnType = [new Set([UNKNOWN_NODE_TYPE])];
        this.setReturnTypeInCache(res, node.start, node.end);
        return res;
      }

      const leftNodeType = this.getReturnType(node.left)[0];
      const rightNodeType = this.getReturnType(node.right)[0];

      if (
        leftNodeType.has(UNKNOWN_NODE_TYPE) ||
        rightNodeType.has(UNKNOWN_NODE_TYPE)
      ) {
        const res: INodeReturnType = [new Set([UNKNOWN_NODE_TYPE])];
        this.setReturnTypeInCache(res, node.start, node.end);
        return res;
      }

      for (let i = 0; i < operator.length; i++) {
        const returnTypeVariant = operator[i].returnType;
        const neededTypeVariant = operator[i].operandType;

        // operandtype = null means that operands may be any types but this types should be equality
        if (
          neededTypeVariant === null &&
          leftNodeType.size === 1 &&
          rightNodeType.size === 1
        ) {
          const res: INodeReturnType = [new Set([returnTypeVariant]), i];
          this.setReturnTypeInCache(res, node.start, node.end);
          return res;
        }
        if (
          neededTypeVariant !== null &&
          !Array.isArray(neededTypeVariant) &&
          leftNodeType.has(neededTypeVariant) &&
          rightNodeType.has(neededTypeVariant) &&
          leftNodeType.size === 1 &&
          rightNodeType.size === 1
        ) {
          const res: INodeReturnType = [new Set([returnTypeVariant]), i];
          this.setReturnTypeInCache(res, node.start, node.end);
          return res;
        }
        if (
          neededTypeVariant !== null &&
          Array.isArray(neededTypeVariant) &&
          leftNodeType.size === 1 &&
          rightNodeType.size === 1
        ) {
          let coincidence = 0;
          neededTypeVariant.forEach((curType) => {
            if (leftNodeType.has(curType)) {
              coincidence++;
            }
            if (rightNodeType.has(curType)) {
              coincidence++;
            }
          });
          if (coincidence === 2) {
            const res: INodeReturnType = [new Set([returnTypeVariant]), i];
            this.setReturnTypeInCache(res, node.start, node.end);
            return res;
          }
        }
      }
      const res: INodeReturnType = [new Set([UNKNOWN_NODE_TYPE])];
      this.setReturnTypeInCache(res, node.start, node.end);
      return res;
    }
    if (node instanceof IfStatementNode) {
      const consequent = this.getReturnType(node.consequent);
      const alternate = this.getReturnType(node.alternate);
      alternate[0].forEach((i) => consequent[0].add(i));

      this.setReturnTypeInCache(consequent, node.start, node.end);
      return consequent;
    }
    if (node instanceof FunctionNode) {
      const currentFunction = allFunctions[node.name as ValidFunctionsNames];

      if (!currentFunction) {
        const res: INodeReturnType = [new Set([UNKNOWN_NODE_TYPE])];
        this.setReturnTypeInCache(res, node.start, node.end);
        return res;
      }

      // empty args array means func does not accept any arguments
      if (node.args.length === 0 && currentFunction[0].args.length === 0) {
        const res: INodeReturnType = [
          new Set(currentFunction[0].returnType),
          0,
        ];
        this.setReturnTypeInCache(res, node.start, node.end);
        return res;
      }

      // get all types for node args
      const nodeArgs: [Set<string>, number?][] = [];
      for (const arg of node.args) {
        const argType = this.getReturnType(arg);
        // this.setNodeTypeInCache(argType, arg.start);

        if (!argType[0].has(UNKNOWN_NODE_TYPE)) {
          nodeArgs.push(argType);
        } else {
          const res: INodeReturnType = [new Set([UNKNOWN_NODE_TYPE])];
          this.setReturnTypeInCache(res, node.start, node.end);
          return res;
        }
      }

      // compare the data types of the node and possible implementations of this function
      for (let i = 0; i < currentFunction.length; i++) {
        let coincidences = 0;
        const functionVariant = currentFunction[i];
        const functionVariantReturnType = functionVariant.returnType;
        const functionVariantArgs = functionVariant.args;
        const lastArgType =
          functionVariantArgs[functionVariantArgs.length - 1]?.type;
        const isLastArgMany =
          functionVariantArgs[functionVariantArgs.length - 1]?.many || false;

        if (nodeArgs.length === 0 && functionVariantArgs.length !== 0) {
          break;
        }

        // in a loop we go through all the arguments of the node
        for (let j = 0; j < nodeArgs.length; j++) {
          const canArgBeLast = functionVariantArgs.length - 1 <= j;
          const nodeArgType = nodeArgs[j][0];
          let argVariantsCoincidence = 0;
          // may be undefined in case with arg which can be many
          const functionVariantCurrentArg = functionVariantArgs[j];
          if (functionVariantCurrentArg) {
            functionVariantCurrentArg.type.forEach((possibleArgType) => {
              if (nodeArgType.has(possibleArgType)) {
                argVariantsCoincidence++;
              }
            });
            if (
              argVariantsCoincidence <= functionVariantCurrentArg.type.length &&
              ((argVariantsCoincidence !== 0 &&
                argVariantsCoincidence === nodeArgType.size) ||
                (argVariantsCoincidence === 0 &&
                  functionVariantCurrentArg.type.length === 0))
            ) {
              coincidences++;
            }
          } else {
            if (lastArgType) {
              lastArgType.forEach((possibleArgType) => {
                if (
                  nodeArgType.has(possibleArgType) &&
                  canArgBeLast &&
                  lastArgType &&
                  isLastArgMany
                ) {
                  argVariantsCoincidence++;
                }
              });
              if (
                argVariantsCoincidence <= lastArgType.length &&
                ((argVariantsCoincidence !== 0 &&
                  argVariantsCoincidence === nodeArgType.size) ||
                  (argVariantsCoincidence === 0 &&
                    lastArgType.length === 0 &&
                    canArgBeLast &&
                    lastArgType &&
                    isLastArgMany))
              ) {
                coincidences++;
              }
            }
          }
        }
        if (coincidences === nodeArgs.length) {
          const res: INodeReturnType = [new Set(functionVariantReturnType), i];
          this.setReturnTypeInCache(res, node.start, node.end);
          return res;
        }
      }
    }
    const res: INodeReturnType = [new Set([UNKNOWN_NODE_TYPE])];
    this.setReturnTypeInCache(res, node.start, node.end);
    return res;
  }

  // TODO: need to be taken out traverse
  // only map variables. it is supposed to be used before conversion to js or sql
  mapIdentifiers(
    node: ExpressionNode,
    { from, to }: { from?: keyof ParserVar | undefined; to: keyof ParserVar },
  ): string | string[] {
    const variables = Object.values(this.variables);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const traverse = (n: ExpressionNode): any => {
      if (n instanceof NumberNode) {
        return n.number.text;
      }
      if (n instanceof LiteralNode) {
        return n.literal.text;
      }
      if (n instanceof VariableNode) {
        const varKey = removePrefixSuffix(n.variable.text);

        let variable;

        if (from) {
          variable = variables.find((v) => v && v[from] == varKey);
        } else {
          variable = this.variables[varKey];
        }

        if (!variable) {
          throw new Error(
            `Variable ${varKey} or matching 'from' field not found`,
          );
        }

        if (!variable[to]) {
          throw new Error(`Variable ${varKey} doesn't have the '${to}' field`);
        }

        return `${FORMULA_TEMPLATES.PREFIX}${variable[to]}${FORMULA_TEMPLATES.POSTFIX}`;
      }
      if (n instanceof BooleanNode || n instanceof NullNode) {
        return n.keyword.text;
      }
      if (n instanceof ParenthesizedNode) {
        return `(${traverse(n.expression)})`;
      }
      if (n instanceof UnarOperationNode) {
        return `${n.operator.text} ${traverse(n.operand)}`;
      }
      if (n instanceof BinOperationNode) {
        return `${traverse(n.left)} ${n.operator.text} ${traverse(n.right)}`;
      }
      if (n instanceof IfStatementNode) {
        return `${n.ifToken.text}(${traverse(n.test)}, ${traverse(n.consequent)} ${traverse(n.alternate)})`;
      }
      if (n instanceof FunctionNode) {
        return `${n.func.text}(${n.args.map((i) => traverse(i))})`;
      }
      if (n instanceof StatementsNode) {
        return n.codeStrings.map((i) => traverse(i));
      }
      throw new Error('Impossible map identifiers because formula has Error');
    };
    return traverse(node);
  }

  getVariables(node: ExpressionNode): Set<string> {
    const variables = new Set<string>();

    const traverse = (n: ExpressionNode) => {
      if (n instanceof VariableNode) {
        variables.add(n.variable.text);
      } else if (n instanceof BinOperationNode) {
        traverse(n.left);
        traverse(n.right);
      } else if (n instanceof UnarOperationNode) {
        traverse(n.operand);
      } else if (n instanceof ParenthesizedNode) {
        traverse(n.expression);
      } else if (n instanceof FunctionNode) {
        n.args.forEach(traverse);
      } else if (n instanceof IfStatementNode) {
        if (n.consequent) traverse(n.consequent);
        if (n.alternate) traverse(n.alternate);
        if (n.test) traverse(n.test);
      } else if (n instanceof StatementsNode) {
        n.codeStrings.forEach(traverse);
      }
    };

    traverse(node);
    return variables;
  }

  getCachedReturnType(start: number, end: number): INodeReturnType {
    return this.returnTypesCache[`${start}${end}`];
  }

  setReturnTypeInCache(
    type: INodeReturnType,
    start: number,
    end: number,
  ): void {
    this.returnTypesCache[`${start}${end}`] = type;
  }
}
