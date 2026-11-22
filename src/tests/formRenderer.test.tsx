import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import FormGenerator from "../components/FormGenerator";
import { themeMap } from "../utils/appTheme";

const theme = { primaryColor: "indigo", borderRadius: "md", layout: "1-col" as const, shadow: "md" };
const tokens = themeMap.light;

const mount = (schema: any, onSubmit = vi.fn(), extra: Record<string, any> = {}) => {
  const utils = render(
    <FormGenerator schema={schema} theme={theme} themeTokens={tokens} onSubmitSubmission={onSubmit} {...extra} />
  );
  return { onSubmit, ...utils };
};

const submit = () => fireEvent.click(screen.getByRole("button", { name: /Submit Form/i }));
const change = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("typed values", () => {
  const schema = {
    formTitle: "Typed",
    fields: [
      { id: "age", type: "number", label: "Age" },
      { id: "news", type: "checkbox", label: "Newsletter" },
      {
        id: "tags", type: "multiselect", label: "Tags",
        options: [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }, { value: 7, label: "Seven" }]
      },
      { id: "vol", type: "slider", label: "Volume", min: 0, max: 10 },
      { id: "plan", type: "radio", label: "Plan", options: [{ value: 1, label: "One" }, { value: 2, label: "Two" }] },
      { id: "campaign", type: "hidden", defaultValue: "spring" }
    ]
  };

  test("numbers stay numbers, checkbox is boolean, multiselect is an array of original values", async () => {
    const { onSubmit } = mount(schema);
    change(/Age/, "42");
    fireEvent.click(screen.getByLabelText(/Newsletter/));
    fireEvent.click(screen.getByLabelText("Alpha"));
    fireEvent.click(screen.getByLabelText("Seven"));
    fireEvent.change(screen.getByLabelText(/Volume/), { target: { value: "6" } });
    fireEvent.click(screen.getByLabelText("Two"));
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      age: 42, news: true, tags: ["a", 7], vol: 6, plan: 2, campaign: "spring"
    });
  });

  test("untouched form yields typed defaults", async () => {
    const { onSubmit } = mount(schema);
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({ age: "", news: false, tags: [], vol: 0, plan: "", campaign: "spring" });
  });
});

describe("validation + a11y", () => {
  const schema = {
    formTitle: "V",
    fields: [
      { id: "email", type: "email", label: "Email", required: true, description: "Work address" },
      { id: "age", type: "number", label: "Age", min: 18 }
    ]
  };

  test("blocks submit, shows role=alert errors wired through aria-describedby, announces the count", async () => {
    const { onSubmit } = mount(schema);
    submit();
    const err = await screen.findByText("This field is required.");
    expect(err).toHaveAttribute("role", "alert");
    expect(onSubmit).not.toHaveBeenCalled();

    const input = screen.getByLabelText(/Email/);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-required", "true");
    const described = input.getAttribute("aria-describedby")!.split(" ");
    expect(described).toContain(err.id);
    expect(described.some((id) => document.getElementById(id)?.textContent === "Work address")).toBe(true);
    await waitFor(() => expect(screen.getByTestId("form-announcer")).toHaveTextContent("Please fix 1 error before continuing."));
  });

  test("errors clear as the user fixes the field", async () => {
    mount(schema);
    submit();
    await screen.findByText("This field is required.");
    change(/Email/, "a@b.co");
    await waitFor(() => expect(screen.queryByText("This field is required.")).not.toBeInTheDocument());
    expect(screen.getByLabelText(/Email/)).not.toHaveAttribute("aria-invalid");
  });

  test("format and range messages", async () => {
    mount(schema);
    change(/Email/, "nope");
    change(/Age/, "10");
    submit();
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Must be at least 18.")).toBeInTheDocument();
  });

  test("required fields expose a text alternative for the asterisk", () => {
    mount(schema);
    expect(screen.getByText("(required)")).toBeInTheDocument();
  });

  test("radio / multiselect render as labelled groups", () => {
    mount({
      formTitle: "G",
      fields: [
        { id: "r", type: "radio", label: "Pick one", required: true, options: [{ value: "a", label: "A" }] },
        { id: "m", type: "multiselect", label: "Pick many", options: [{ value: "a", label: "A" }] }
      ]
    });
    expect(screen.getByRole("radiogroup", { name: /Pick one/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Pick many/ })).toBeInTheDocument();
  });

  test("two forms on one page never share DOM ids", () => {
    const schema1 = { formTitle: "A", fields: [{ id: "x", type: "text", label: "X" }] };
    render(
      <>
        <FormGenerator schema={schema1} theme={theme} themeTokens={tokens} onSubmitSubmission={vi.fn()} />
        <FormGenerator schema={schema1} theme={theme} themeTokens={tokens} onSubmitSubmission={vi.fn()} />
      </>
    );
    const ids = screen.getAllByLabelText("X").map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("rating (keyboard accessible radiogroup)", () => {
  const schema = { formTitle: "R", fields: [{ id: "score", type: "rating", label: "Score", max: 5, required: true }] };

  test("click selects; arrows move and select; roving tabindex", async () => {
    const { onSubmit } = mount(schema);
    const group = screen.getByRole("radiogroup", { name: /Score/ });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(5);
    expect(radios[0]).toHaveAttribute("tabindex", "0");
    expect(radios[1]).toHaveAttribute("tabindex", "-1");

    fireEvent.click(radios[2]);
    expect(radios[2]).toHaveAttribute("aria-checked", "true");
    expect(radios[2]).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(radios[2], { key: "ArrowRight" });
    expect(radios[3]).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(radios[3], { key: "ArrowLeft" });
    fireEvent.keyDown(radios[2], { key: "Home" });
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(radios[0], { key: "End" });
    expect(radios[4]).toHaveAttribute("aria-checked", "true");

    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ score: 5 }));
  });

  test("required rating blocks submit until set", async () => {
    const { onSubmit } = mount(schema);
    submit();
    expect(await screen.findByText("Please provide a rating.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("file field", () => {
  test("stores only metadata and enforces type/size", async () => {
    const schema = { formTitle: "F", fields: [{ id: "cv", type: "file", label: "CV", required: true, accept: ".pdf", maxSizeKB: 1 }] };
    const { onSubmit } = mount(schema);
    const input = screen.getByLabelText(/CV/) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [new File(["x".repeat(10)], "evil.exe", { type: "application/x-msdownload" })] } });
    submit();
    expect(await screen.findByText("File type not allowed.")).toBeInTheDocument();

    fireEvent.change(input, { target: { files: [new File(["x".repeat(4096)], "big.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(screen.getByText("File is too large (max 1 KB).")).toBeInTheDocument());

    fireEvent.change(input, { target: { files: [new File(["hello"], "ok.pdf", { type: "application/pdf" })] } });
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ cv: [{ name: "ok.pdf", size: 5, type: "application/pdf" }] });
  });
});

describe("conditional logic", () => {
  const schema = {
    formTitle: "C",
    fields: [
      { id: "plan", type: "select", label: "Plan", options: [{ value: "free", label: "Free" }, { value: "pro", label: "Pro" }] },
      { id: "seats", type: "number", label: "Seats", visibleIf: "plan == 'pro'", requiredIf: "plan == 'pro'" },
      { id: "note", type: "text", label: "Note", visibleIf: { field: "plan", op: "eq", value: "free" } }
    ]
  };

  test("fields show/hide live, required follows condition, hidden values are dropped from the submission", async () => {
    const { onSubmit } = mount(schema);
    expect(screen.queryByLabelText(/Seats/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Note/)).not.toBeInTheDocument();

    change(/Plan/, "free");
    expect(screen.getByLabelText(/Note/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "stale" } });

    change(/Plan/, "pro");
    expect(screen.queryByLabelText(/Note/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Seats/)).toHaveAttribute("aria-required", "true");

    submit();
    expect(await screen.findByText("This field is required.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    change(/Seats/, "3");
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ plan: "pro", seats: 3 }); // "note" (hidden) is not leaked
  });
});

describe("calculated fields", () => {
  test("recompute on input and are included in the submission", async () => {
    const schema = {
      formTitle: "Calc",
      fields: [
        { id: "price", type: "number", label: "Price" },
        { id: "qty", type: "number", label: "Qty" },
        { id: "total", type: "calculated", label: "Total", formula: "round(price * qty, 2)", precision: 2 }
      ]
    };
    const { onSubmit } = mount(schema);
    expect(screen.getByTestId("calc-total")).toHaveTextContent("—");
    change(/Price/, "9.99");
    change(/Qty/, "3");
    expect(screen.getByTestId("calc-total")).toHaveTextContent("29.97");
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ price: 9.99, qty: 3, total: 29.97 }));
  });
});

describe("multi-step", () => {
  const schema = {
    formTitle: "Wizard",
    fields: [
      { id: "name", type: "text", label: "Name", required: true },
      { id: "pb", type: "pagebreak", label: "Contact" },
      { id: "email", type: "email", label: "Email", required: true },
      { id: "pb2", type: "pagebreak", label: "Extras", visibleIf: "wantExtras == true" },
      { id: "extra", type: "text", label: "Extra info", required: true },
      { id: "wantExtras", type: "checkbox", label: "Add extras" }
    ]
  };
  const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));

  test("shows progress, validates per step, supports Back, and submits once at the end", async () => {
    const { onSubmit } = mount(schema);
    const bar = screen.getByRole("progressbar", { name: "Form progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "2");
    expect(screen.getByText(/Step 1 of 2/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Email/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Submit Form/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();

    next(); // name is required
    expect(await screen.findByText("This field is required.")).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 2/)).toBeInTheDocument();

    change(/Name/, "Ada");
    next();
    expect(await screen.findByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.getByText(/Step 2 of 2 — Contact/)).toBeInTheDocument();
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    await waitFor(() => expect(screen.getByText(/Step 2 of 2 — Contact/)).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByLabelText(/Name/)).toHaveValue("Ada"); // value retained across steps

    next();
    await screen.findByLabelText(/Email/);
    change(/Email/, "ada@example.com");
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ name: "Ada", email: "ada@example.com", wantExtras: false });
  });

  test("a conditional page break adds a step on demand", async () => {
    mount(schema);
    change(/Name/, "Ada");
    next();
    await screen.findByLabelText(/Email/);
    fireEvent.click(screen.getByLabelText("Add extras")); // wantExtras lives on step 2 here? (merged until pb2 is visible)
    expect(await screen.findByText(/Step 2 of 3/)).toBeInTheDocument();
  });

  test("Enter on a middle step advances instead of submitting", async () => {
    const { onSubmit, container } = mount(schema);
    change(/Name/, "Ada");
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findByLabelText(/Email/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("a failing field on an earlier step sends the user back to it on submit", async () => {
    const s = {
      formTitle: "Back",
      fields: [
        { id: "a", type: "text", label: "A" },
        { id: "pb", type: "pagebreak", label: "Two" },
        { id: "b", type: "checkbox", label: "B" },
        { id: "gate", type: "text", label: "Gate", requiredIf: "b == true" }
      ]
    };
    // make step-1 field invalid *after* leaving it by making it conditionally required on step-2 state
    const s2 = {
      ...s,
      fields: [
        { id: "a", type: "text", label: "A", requiredIf: "b == true" },
        s.fields[1],
        s.fields[2],
        { id: "gate", type: "text", label: "Gate" }
      ]
    };
    const { onSubmit } = mount(s2);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByLabelText("B");
    fireEvent.click(screen.getByLabelText("B"));
    submit();
    expect(await screen.findByText(/Step 1 of 2/)).toBeInTheDocument();
    expect(screen.getByText("This field is required.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("submission UX", () => {
  test("shows success panel with formatted values, then resets for another fill", async () => {
    const schema = {
      formTitle: "S",
      fields: [
        { id: "ok", type: "checkbox", label: "Agree" },
        { id: "t", type: "multiselect", label: "Topics", options: [{ value: "a", label: "A" }] }
      ]
    };
    mount(schema);
    fireEvent.click(screen.getByLabelText("Agree"));
    fireEvent.click(screen.getByLabelText("A"));
    submit();
    expect(await screen.findByText("Submission Successful!")).toBeInTheDocument();
    expect(screen.getByText(/Agree:/).parentElement).toHaveTextContent("Agree: Yes");
    expect(screen.getByText(/Topics:/).parentElement).toHaveTextContent("Topics: a");
    fireEvent.click(screen.getByRole("button", { name: "Fill Form Again" }));
    expect(screen.queryByText("Submission Successful!")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Agree")).not.toBeChecked();
  });

  test("single-fill mode hides the fill-again button", async () => {
    mount({ formTitle: "S", fields: [{ id: "x", type: "text", label: "X" }] }, vi.fn(), { fillMode: "single" });
    submit();
    expect(await screen.findByText(/Single fill constraint active/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fill Form Again" })).not.toBeInTheDocument();
  });

  test("live schema edits (builder) add fields without losing entered values", () => {
    const base = { formTitle: "L", fields: [{ id: "a", type: "text", label: "A" }] };
    const { rerender } = mount(base);
    change("A", "kept");
    rerender(
      <FormGenerator
        schema={{ ...base, fields: [...base.fields, { id: "b", type: "text", label: "B" }] }}
        theme={theme}
        themeTokens={tokens}
        onSubmitSubmission={vi.fn()}
      />
    );
    expect(screen.getByLabelText("A")).toHaveValue("kept");
    expect(screen.getByLabelText("B")).toBeInTheDocument();
  });

  test("renders the empty state when there are no fields", () => {
    mount({ formTitle: "E", fields: [] });
    expect(screen.getByText("Form Preview")).toBeInTheDocument();
  });

  test("ids with dots/brackets work end to end", async () => {
    const { onSubmit } = mount({ formTitle: "D", fields: [{ id: "user.name[0]", type: "text", label: "Who", required: true }] });
    submit();
    expect(await screen.findByText("This field is required.")).toBeInTheDocument();
    change("Who", "Ada");
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ "user.name[0]": "Ada" }));
  });
});
