import path from "path";
import { createSlice, AnyAction } from "@reduxjs/toolkit";
import { actions as projectActions } from "../project/projectActions";

interface DocumentState {
  modified: boolean;
  loaded: boolean;
  saving: boolean;
  path: string;
  root: string;
}

const initialState: DocumentState = {
  modified: false,
  loaded: false,
  saving: false,
  path: "",
  root: "",
};

const documentSlice = createSlice({
  name: "document",
  initialState,
  reducers: {},
  extraReducers: (builder) =>
    builder
    .addCase(projectActions.loadProject.pending, (state, _action) => {
      state.loaded = false;
    })
    .addCase(projectActions.loadProject.fulfilled, (state, action) => {
      state.path = action.payload.path,
      state.root = path.dirname(action.payload.path);
      state.modified = false;
      state.loaded = true;
    })
    .addMatcher(
      (action: AnyAction): action is AnyAction =>
        (action.type.startsWith("entities/") ||
          action.type.startsWith("metadata/") ||
          action.type.startsWith("settings/")),
      (state, _action) => {
        state.modified = true;
      }
    ),
});

const { reducer } = documentSlice;

export default reducer;
