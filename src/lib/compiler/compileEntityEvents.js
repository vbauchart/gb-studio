import {
  EVENT_END,
  EVENT_IF_FALSE,
  EVENT_IF_VALUE,
  EVENT_LOOP,
  EVENT_GROUP,
  EVENT_ACTOR_SET_MOVEMENT_SPEED,
  EVENT_ACTOR_SET_ANIMATION_SPEED,
  EVENT_AWAIT_INPUT,
  EVENT_STOP,
  EVENT_IF_INPUT,
  EVENT_IF_ACTOR_AT_POSITION,
  EVENT_IF_ACTOR_DIRECTION,
  EVENT_IF_SAVED_DATA,
  EVENT_IF_VALUE_COMPARE,
  EVENT_SCENE_PUSH_STATE,
  EVENT_SCENE_POP_STATE,
  EVENT_SCENE_RESET_STATE,
  EVENT_SCENE_POP_ALL_STATE,
  EVENT_SET_INPUT_SCRIPT,
  EVENT_REMOVE_INPUT_SCRIPT
} from "./eventTypes";
import { hi, lo } from "../helpers/8bit";
import {
  dirDec,
  inputDec,
  moveSpeedDec,
  animSpeedDec,
  operatorDec
} from "./helpers";
import ScriptBuilder from "./scriptBuilder";
import events from "../events";

const STRING_NOT_FOUND = "STRING_NOT_FOUND";
const VARIABLE_NOT_FOUND = "VARIABLE_NOT_FOUND";

class CompileEventsError extends Error {
  constructor(message, data) {
    super(message);
    this.data = data;
    this.name = "CompileEventsError";
  }
}

// @todo
// Maybe have list of script commands
// Mark which ones can appear in ui dropdowns
// and what the args are for each (to build forms)
// and what the command code is?

const CMD_LOOKUP = {
  END: 0x00, // done
  TEXT: 0x01, // - done
  JUMP: 0x02,
  IF_TRUE: 0x03,
  // script_cmd_unless_variable: 0x04,
  SET_TRUE: 0x05,
  SET_FALSE: 0x06,
  ACTOR_SET_DIRECTION: 0x07,
  ACTOR_SET_ACTIVE: 0x08,
  CAMERA_MOVE_TO: 0x09,
  CAMERA_LOCK: 0x0a,
  WAIT: 0x0b,
  FADE_OUT: 0x0c,
  FADE_IN: 0x0d,
  SWITCH_SCENE: 0x0e,
  ACTOR_SET_POSITION: 0x0f,
  ACTOR_MOVE_TO: 0x10,
  SHOW_SPRITES: 0x11,
  HIDE_SPRITES: 0x12,
  PLAYER_SET_SPRITE: 0x13,
  ACTOR_SHOW: 0x14,
  ACTOR_HIDE: 0x15,
  ACTOR_EMOTE: 0x16,
  CAMERA_SHAKE: 0x17,
  RETURN_TO_TITLE: 0x18,
  OVERLAY_SHOW: 0x19,
  OVERLAY_HIDE: 0x1a,
  OVERLAY_SET_POSITION: 0x1b,
  OVERLAY_MOVE_TO: 0x1c,
  AWAIT_INPUT: 0x1d,
  MUSIC_PLAY: 0x1e,
  MUSIC_STOP: 0x1f,
  RESET_VARIABLES: 0x20,
  NEXT_FRAME: 0x21,
  INC_VALUE: 0x22,
  DEC_VALUE: 0x23,
  SET_VALUE: 0x24,
  IF_VALUE: 0x25,
  IF_INPUT: 0x26,
  CHOICE: 0x27,
  ACTOR_PUSH: 0x28,
  IF_ACTOR_AT_POSITION: 0x29,
  LOAD_DATA: 0x2a,
  SAVE_DATA: 0x2b,
  CLEAR_DATA: 0x2c,
  IF_SAVED_DATA: 0x2d,
  IF_ACTOR_DIRECTION: 0x2e,
  SET_RANDOM_VALUE: 0x2f,
  ACTOR_GET_POSITION: 0x30,
  ACTOR_SET_POSITION_TO_VALUE: 0x31,
  ACTOR_MOVE_TO_VALUE: 0x32,
  ACTOR_MOVE_RELATIVE: 0x33,
  ACTOR_SET_POSITION_RELATIVE: 0x34,
  MATH_ADD: 0x35,
  MATH_SUB: 0x36,
  MATH_MUL: 0x37,
  MATH_DIV: 0x38,
  MATH_MOD: 0x39,
  MATH_ADD_VALUE: 0x3a,
  MATH_SUB_VALUE: 0x3b,
  MATH_MUL_VALUE: 0x3c,
  MATH_DIV_VALUE: 0x3d,
  MATH_MOD_VALUE: 0x3e,
  COPY_VALUE: 0x3f,
  IF_VALUE_COMPARE: 0x40,
  LOAD_VECTORS: 0x41,
  ACTOR_SET_MOVE_SPEED: 0x42,
  ACTOR_SET_ANIM_SPEED: 0x43,
  TEXT_SET_ANIM_SPEED: 0x44,
  SCENE_PUSH_STATE: 0x45,
  SCENE_POP_STATE: 0x46,
  ACTOR_INVOKE: 0x47,
  STACK_PUSH: 0x48,
  STACK_POP: 0x49,
  SCENE_STATE_RESET: 0x4a,
  SCENE_POP_ALL_STATE: 0x4b,
  SET_INPUT_SCRIPT: 0x4c,
  REMOVE_INPUT_SCRIPT: 0x4d,
  ACTOR_SET_FRAME: 0x4e,
  ACTOR_SET_FLIP: 0x4f,
  TEXT_MULTI: 0x50
};

const getActorIndex = (actorId, scene) => {
  return scene.actors.findIndex(a => a.id === actorId) + 1;
};

const getVariableIndex = (variable, variables) => {
  const variableIndex = variables.indexOf(String(variable));
  if (variableIndex === -1) {
    throw new CompileEventsError(VARIABLE_NOT_FOUND, { variable });
  }
  return variableIndex;
};

const loadVectors = (args, output, variables) => {
  const vectorX = getVariableIndex(args.vectorX, variables);
  const vectorY = getVariableIndex(args.vectorY, variables);
  output.push(CMD_LOOKUP.LOAD_VECTORS);
  output.push(hi(vectorX));
  output.push(lo(vectorX));
  output.push(hi(vectorY));
  output.push(lo(vectorY));
};

const compileConditional = (truePath, falsePath, options) => {
  const { output } = options;

  const truePtrIndex = output.length;
  output.push("PTR_PLACEHOLDER1");
  output.push("PTR_PLACEHOLDER2");
  precompileEntityScript(falsePath, {
    ...options,
    output,
    branch: true
  });

  output.push(CMD_LOOKUP.JUMP);
  const endPtrIndex = output.length;
  output.push("PTR_PLACEHOLDER1");
  output.push("PTR_PLACEHOLDER2");

  const truePointer = output.length;
  output[truePtrIndex] = truePointer >> 8;
  output[truePtrIndex + 1] = truePointer & 0xff;

  precompileEntityScript(truePath, {
    ...options,
    branch: true
  });

  const endIfPointer = output.length;
  output[endPtrIndex] = endIfPointer >> 8;
  output[endPtrIndex + 1] = endIfPointer & 0xff;
};

const precompileEntityScript = (input = [], options = {}) => {
  const { output = [], scene, variables, subScripts, branch = false } = options;

  for (let i = 0; i < input.length; i++) {
    const command = input[i].command;

    if (events[command]) {
      const helpers = {
        ...options,
        compile: precompileEntityScript
      };
      const scriptBuilder = new ScriptBuilder(output, helpers);
      events[command].compile(
        {
          ...input[i].args,
          true: input[i].true,
          false: input[i].false
        },
        {
          ...helpers,
          ...scriptBuilder
        }
      );
      // eslint-disable-next-line no-continue
      continue;
    }

    if (command === EVENT_IF_FALSE) {
      output.push(CMD_LOOKUP.IF_TRUE);
      const variableIndex = getVariableIndex(input[i].args.variable, variables);
      output.push(hi(variableIndex));
      output.push(lo(variableIndex));
      compileConditional(input[i].false, input[i].true, {
        ...options,
        output
      });
    } else if (command === EVENT_IF_VALUE) {
      output.push(CMD_LOOKUP.IF_VALUE);
      const variableIndex = getVariableIndex(input[i].args.variable, variables);
      output.push(hi(variableIndex));
      output.push(lo(variableIndex));
      output.push(operatorDec(input[i].args.operator));
      output.push(input[i].args.comparator || 0);
      compileConditional(input[i].true, input[i].false, {
        ...options,
        output
      });
    } else if (command === EVENT_IF_VALUE_COMPARE) {
      loadVectors(input[i].args, output, variables);
      output.push(CMD_LOOKUP.IF_VALUE_COMPARE);
      output.push(operatorDec(input[i].args.operator));
      compileConditional(input[i].true, input[i].false, {
        ...options,
        output
      });
    } else if (command === EVENT_IF_INPUT) {
      output.push(CMD_LOOKUP.IF_INPUT);
      output.push(inputDec(input[i].args.input));
      compileConditional(input[i].true, input[i].false, {
        ...options,
        output
      });
    } else if (command === EVENT_IF_ACTOR_AT_POSITION) {
      const actorIndex = getActorIndex(input[i].args.actorId, scene);
      output.push(CMD_LOOKUP.IF_ACTOR_AT_POSITION);
      output.push(actorIndex);
      output.push(input[i].args.x || 0);
      output.push(input[i].args.y || 0);
      compileConditional(input[i].true, input[i].false, {
        ...options,
        output
      });
    } else if (command === EVENT_IF_ACTOR_DIRECTION) {
      const actorIndex = getActorIndex(input[i].args.actorId, scene);
      output.push(CMD_LOOKUP.ACTOR_SET_ACTIVE);
      output.push(actorIndex);
      output.push(CMD_LOOKUP.IF_ACTOR_DIRECTION);
      output.push(dirDec(input[i].args.direction));
      compileConditional(input[i].true, input[i].false, {
        ...options,
        output
      });
    } else if (command === EVENT_ACTOR_SET_MOVEMENT_SPEED) {
      const actorIndex = getActorIndex(input[i].args.actorId, scene);
      output.push(CMD_LOOKUP.ACTOR_SET_ACTIVE);
      output.push(actorIndex);
      output.push(CMD_LOOKUP.ACTOR_SET_MOVE_SPEED);
      output.push(moveSpeedDec(input[i].args.speed));
    } else if (command === EVENT_ACTOR_SET_ANIMATION_SPEED) {
      const actorIndex = getActorIndex(input[i].args.actorId, scene);
      output.push(CMD_LOOKUP.ACTOR_SET_ACTIVE);
      output.push(actorIndex);
      output.push(CMD_LOOKUP.ACTOR_SET_ANIM_SPEED);
      output.push(animSpeedDec(input[i].args.speed));
    } else if (command === EVENT_SCENE_PUSH_STATE) {
      output.push(CMD_LOOKUP.SCENE_PUSH_STATE);
    } else if (command === EVENT_SCENE_POP_STATE) {
      output.push(CMD_LOOKUP.SCENE_POP_STATE);
      output.push(input[i].args.fadeSpeed || 2);
      output.push(CMD_LOOKUP.END);
    } else if (command === EVENT_SCENE_RESET_STATE) {
      output.push(CMD_LOOKUP.SCENE_STATE_RESET);
    } else if (command === EVENT_SCENE_POP_ALL_STATE) {
      output.push(CMD_LOOKUP.SCENE_POP_ALL_STATE);
      output.push(input[i].args.fadeSpeed || 2);
      output.push(CMD_LOOKUP.END);
    } else if (command === EVENT_END) {
      // output.push(CMD_LOOKUP.END);
    } else if (command === EVENT_AWAIT_INPUT) {
      output.push(CMD_LOOKUP.AWAIT_INPUT);
      output.push(inputDec(input[i].args.input));
    } else if (command === EVENT_LOOP) {
      const startPtrIndex = output.length;
      precompileEntityScript(input[i].true, {
        ...options,
        output,
        branch: true
      });
      output.push(CMD_LOOKUP.NEXT_FRAME);
      output.push(CMD_LOOKUP.JUMP);
      output.push(startPtrIndex >> 8);
      output.push(startPtrIndex & 0xff);
    } else if (command === EVENT_GROUP) {
      precompileEntityScript(input[i].true, {
        ...options,
        output,
        branch: true
      });
    } else if (command === EVENT_SET_INPUT_SCRIPT) {
      const bankPtr = subScripts[input[i].id];
      if (bankPtr) {
        output.push(CMD_LOOKUP.SET_INPUT_SCRIPT);
        output.push(inputDec(input[i].args.input));
        output.push(bankPtr.bank);
        output.push(hi(bankPtr.offset));
        output.push(lo(bankPtr.offset));
      }
    } else if (command === EVENT_REMOVE_INPUT_SCRIPT) {
      output.push(CMD_LOOKUP.REMOVE_INPUT_SCRIPT);
      output.push(inputDec(input[i].args.input));
    } else if (command === EVENT_STOP) {
      output.push(CMD_LOOKUP.END);
    } else if (command === EVENT_IF_SAVED_DATA) {
      output.push(CMD_LOOKUP.IF_SAVED_DATA);
      compileConditional(input[i].true, input[i].false, {
        ...options,
        output
      });
    }

    for (let oi = 0; oi < output.length; oi++) {
      if (output[oi] < 0) {
        throw new Error("OUTPUT FAILED");
      }
    }
  }

  if (!branch) {
    output.push(CMD_LOOKUP.END);
  }

  return output;
};

export default precompileEntityScript;

export { CMD_LOOKUP, STRING_NOT_FOUND, VARIABLE_NOT_FOUND };
